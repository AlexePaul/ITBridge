import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Query,
    Request,
    StreamableFile,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorators/role.decorator';
import { Role } from 'src/enum/role.enum';
import { ProjectService } from './project.service';
import { ProjectDeliveryService } from './project-delivery.service';
import { ProjectArchiveService } from './project-archive.service';
import { MAX_FILE_BYTES } from './file-types';
import { CreateProjectDto } from './dto/createProject.dto';
import { FilterProjectDto } from './dto/filterProject.dto';
import { IngestProjectDto } from './dto/ingestProject.dto';
import { ReassignProjectDto } from './dto/reassignProject.dto';
import { RegisterLargeFileDto } from './dto/registerLargeFile.dto';
import { ReportProjectDto } from './dto/reportProject.dto';
import { SendProjectsDto } from './dto/sendProjects.dto';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';

/**
 * The HTTP surface of E14.
 *
 * **Route order matters here and nowhere else in this codebase.** `link/:publicId`,
 * `child/:childId/archive` and `group/:groupId/missing` are declared before `:id/…`, because Nest
 * matches in declaration order and `:id` carries a `ParseIntPipe` that would answer 400 to a UUID.
 */
@Controller('projects')
export class ProjectController {
    constructor(
        private readonly projectService: ProjectService,
        private readonly deliveryService: ProjectDeliveryService,
        private readonly archiveService: ProjectArchiveService,
    ) {}

    /**
     * The agent's road in. E14/S2.
     *
     * `ADMIN` because there is no other role: the agent signs in as a dedicated user with that role,
     * and there is no teacher role — E09's is deliberately not being built. See E14, "Decizii luate".
     */
    @Post('ingest')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @UseInterceptors(
        FileInterceptor('file', {
            // Multer holds the file in memory, so this ceiling is the only thing between a share
            // anyone in the school can write to and this process's heap. Video does not come this
            // way at all — it is registered and uploaded straight to storage.
            limits: { fileSize: MAX_FILE_BYTES, files: 1 },
        }),
    )
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: IngestProjectDto })
    @ApiOperation({
        summary: 'Store one file a teacher saved into a child folder',
        description:
            'Idempotent on the content: the key is the child id plus the SHA-256 of the bytes, so a retry after a dropped connection returns the project that already exists instead of making a second one. ' +
            'The type is decided from the file signature, not from the extension.',
    })
    @ApiResponse({ status: 201, description: 'Stored, or already stored — the project either way' })
    @ApiResponse({ status: 404, description: 'Child not found' })
    @ApiResponse({ status: 413, description: 'Past the size limit' })
    @ApiResponse({ status: 415, description: 'Type not accepted, or the bytes disagree with the extension' })
    async ingest(@Body() dto: IngestProjectDto, @UploadedFile() file: Express.Multer.File, @Request() req: AuthenticatedRequest) {
        return this.projectService.ingestFile(dto, file, req.user.sub);
    }

    /**
     * The first half of a large upload: a row, and a signed URL to PUT the bytes to. E14/S2.
     *
     * Video never passes through this process. `putObject` holds the whole file in memory and the API
     * shares an instance with Postgres, so a buffered 200MB upload is not slow, it is fatal.
     */
    @Post('uploads/register')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Register a large file and get a signed URL to upload it directly' })
    @ApiResponse({ status: 201, description: 'Registered; the response carries the URL to PUT to' })
    @ApiResponse({ status: 409, description: 'That content is already stored for this child' })
    @ApiResponse({ status: 415, description: 'Only video takes this road' })
    async registerLargeFile(@Body() dto: RegisterLargeFileDto, @Request() req: AuthenticatedRequest) {
        return this.projectService.registerLargeFile(dto, req.user.sub);
    }

    @Post('files/:fileId/complete')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({
        summary: 'Confirm a direct upload finished',
        description: 'The bucket is asked whether the object is really there; a claim on its own does not mark the file complete.',
    })
    @ApiResponse({ status: 201, description: 'Confirmed' })
    @ApiResponse({ status: 409, description: 'Nothing has been uploaded to that key yet' })
    async completeUpload(@Param('fileId', ParseIntPipe) fileId: number) {
        return this.projectService.completeUpload(fileId);
    }

    /** A project typed in from the group screen: links to work that lives online. E14/S1. */
    @Post()
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Add a project by hand, with one or more links' })
    @ApiResponse({ status: 201, description: 'Created' })
    @ApiResponse({ status: 404, description: 'Child not found' })
    async createProject(@Body() dto: CreateProjectDto, @Request() req: AuthenticatedRequest) {
        return this.projectService.createProject(dto, req.user.sub);
    }

    /**
     * The list, narrowed by who is asking.
     *
     * No `@Roles`: an admin sees the whole school, a parent sees only their own children's work and
     * only what has been sent. Another group's id comes back as an empty list rather than a 403 —
     * for a *list*, "not yours" and "not there" are the same answer, and the narrowing is in the
     * service, off `req.user`, which is the only place identity may come from.
     */
    @Get()
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiOperation({ summary: 'Projects, filtered by group, child, status or date' })
    @ApiResponse({ status: 200, description: 'Projects retrieved' })
    async findProjects(@Query() filters: FilterProjectDto, @Request() req: AuthenticatedRequest) {
        return this.projectService.findProjects(filters, req.user.role, req.user.sub);
    }

    /**
     * What the link in a parent's email opens. E14/S5.
     *
     * **403, not 404, for another family's document** — the resource exists, and a silent refusal is
     * harder to report than an explicit one. The identifier is random precisely so that this
     * endpoint is not probed one integer at a time.
     */
    @Get('link/:publicId')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiOperation({ summary: 'One project, by the identifier in the mailed link' })
    @ApiResponse({ status: 200, description: 'Project retrieved' })
    @ApiResponse({ status: 403, description: "Somebody else's child" })
    @ApiResponse({ status: 404, description: 'No such project' })
    async findByPublicId(@Param('publicId') publicId: string, @Request() req: AuthenticatedRequest) {
        return this.projectService.findByPublicId(publicId, req.user.role, req.user.sub);
    }

    /**
     * A parent saying a document does not look like their child's work. E14/S7.
     *
     * The only write on this controller a parent may perform, and it writes nothing of theirs: it
     * queues a message to the office. A parent deleting a project outright would need a new entry in
     * `PARENT_WRITABLE`, which is the intention that list protects.
     */
    @Post('link/:publicId/report')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiOperation({ summary: 'Report a wrongly assigned or unreadable document to the school' })
    @ApiResponse({ status: 201, description: 'Reported; the office has been written to' })
    @ApiResponse({ status: 403, description: "Somebody else's child" })
    async reportProject(@Param('publicId') publicId: string, @Body() dto: ReportProjectDto, @Request() req: AuthenticatedRequest) {
        return this.deliveryService.report(publicId, dto, req.user.role, req.user.sub);
    }

    /** Everything one child has built, as a single download. E14/S5. */
    @Get('child/:childId/archive')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiOperation({ summary: "One child's whole gallery as a zip" })
    @ApiResponse({ status: 200, description: 'Archive streamed' })
    @ApiResponse({ status: 404, description: 'Child not found, or not yours' })
    async archive(@Param('childId', ParseIntPipe) childId: number, @Request() req: AuthenticatedRequest) {
        const { archive, filename } = await this.archiveService.forChild(childId, req.user.role, req.user.sub);
        return new StreamableFile(archive, { type: 'application/zip', disposition: `attachment; filename="${filename}"` });
    }

    /**
     * Which children in a group have nothing for a given day.
     *
     * A read, never a write. E14 is explicit that attendance is not derived from files — a document
     * proves somebody saved a file, not that a child sat in a chair — but the reverse direction is
     * useful: a nudge on the group screen while the class is still in the room.
     */
    /**
     * What is waiting for somebody to press send, and for how long — E17/S8.
     *
     * Declared with the other literal routes, before `:id/…`: Nest matches in declaration order and
     * `:id` carries a `ParseIntPipe`, which answers 400 to the word "pending".
     */
    @Get('pending')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({
        summary: 'Câte documente așteaptă să fie trimise, și de câte zile',
        description: 'Numărul singur nu spune nimic: cinci urcate azi sunt o zi normală, unul de marți rămas vineri e o scăpare.',
    })
    async pending() {
        return this.projectService.pendingSummary();
    }

    @Get('group/:groupId/missing')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Children in the group with no document on that day' })
    @ApiResponse({ status: 200, description: 'Children retrieved' })
    async childrenWithoutProjects(@Param('groupId', ParseIntPipe) groupId: number, @Query('on') on: string) {
        return this.projectService.childrenWithoutProjects(groupId, on);
    }

    /**
     * The button. E14/S4, mechanism from E17/S8.
     *
     * Declared before `:id/…` for the same reason as the routes above, and it takes a list of
     * documents rather than a group: the review *is* the point, and "send everything here" would be
     * the evening job this epic decided against.
     */
    @Post('send')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({
        summary: 'Queue one email per parent for the selected documents',
        description:
            'One press produces N messages, each with exactly one recipient and exactly that recipient own children documents. ' +
            'A parent with two children in the same press gets one message with both. A second press sends nothing.',
    })
    @ApiResponse({ status: 201, description: 'A report of what was queued, skipped and undeliverable' })
    @ApiResponse({ status: 404, description: 'One of the projects does not exist' })
    async send(@Body() dto: SendProjectsDto, @Request() req: AuthenticatedRequest) {
        return this.deliveryService.send(dto, req.user.sub);
    }

    /**
     * A signed URL for one file, issued after the child has been shown to be the caller's. E14/S5.
     *
     * The URL is not the resource: it is minted per request, expires in minutes, and carries
     * `Content-Disposition: attachment`. A storage URL never travels in an email, a message or a log.
     */
    @Get(':id/files/:fileId')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiOperation({ summary: 'A short-lived download URL for one file' })
    @ApiResponse({ status: 200, description: 'URL issued' })
    @ApiResponse({ status: 403, description: "Somebody else's child" })
    @ApiResponse({ status: 409, description: 'The file has not finished uploading' })
    async fileDownload(@Param('id', ParseIntPipe) id: number, @Param('fileId', ParseIntPipe) fileId: number, @Request() req: AuthenticatedRequest) {
        return this.projectService.fileDownloadUrl(id, fileId, req.user.role, req.user.sub);
    }

    /**
     * The thumbnail, inline.
     *
     * The one thing served inline from this domain, and it is safe in a way an uploaded file is not:
     * these bytes were re-encoded by sharp on this server, so a polyglot that is both a valid image
     * and something else did not survive the trip. `nosniff` is belt and braces on top of that.
     */
    @Get(':id/thumbnail')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @Header('X-Content-Type-Options', 'nosniff')
    @Header('Cache-Control', 'private, max-age=3600')
    @ApiOperation({ summary: 'The generated thumbnail of a project' })
    @ApiResponse({ status: 200, description: 'JPEG' })
    @ApiResponse({ status: 404, description: 'No thumbnail for this project' })
    async thumbnail(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
        const bytes = await this.projectService.thumbnail(id, req.user.role, req.user.sub);
        return new StreamableFile(bytes, { type: 'image/jpeg', disposition: 'inline' });
    }

    /** Move a document to the child it actually belongs to, without re-uploading anything. E14/S7. */
    @Put(':id/reassign')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({
        summary: 'Reassign a document to another child',
        description:
            'Leaves the stored objects untouched: the key holds project identifiers, not the child. The answer says whether the email had already gone out and to which address, because that is what decides whether somebody has to make a phone call.',
    })
    @ApiResponse({ status: 200, description: 'Reassigned' })
    @ApiResponse({ status: 409, description: 'Already that child' })
    async reassign(@Param('id', ParseIntPipe) id: number, @Body() dto: ReassignProjectDto, @Request() req: AuthenticatedRequest) {
        return this.projectService.reassign(id, dto, req.user.sub);
    }

    @Delete(':id')
    @ApiBearerAuth()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Delete a document and its stored files' })
    @ApiResponse({ status: 200, description: 'Deleted' })
    @ApiResponse({ status: 404, description: 'Project not found' })
    async deleteProject(@Param('id', ParseIntPipe) id: number) {
        await this.projectService.deleteProject(id);
        return { deleted: true };
    }
}
