import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { Child } from 'src/entities/child.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { User } from 'src/entities/user.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { Role } from 'src/enum/role.enum';
import { isInTime } from './absence-notice.rules';
import { AnnounceAbsenceDto } from './dto/announceAbsence.dto';

/**
 * Absences announced ahead of the class — E12/S3.
 *
 * The story's whole value is in the word *ahead*: the teacher learns before the lesson rather than
 * by counting empty chairs, and a family that took the trouble to say so is treated differently
 * from one that did not. Whether that difference becomes a make-up right is S4; this service
 * records the fact and freezes whether it arrived in time.
 */
@Injectable()
export class AbsenceNoticeService {
    private readonly logger = new Logger('AbsenceNotice');

    constructor(
        @InjectRepository(AbsenceNotice) private readonly noticeRepository: Repository<AbsenceNotice>,
        @InjectRepository(ClassSession) private readonly classSessionRepository: Repository<ClassSession>,
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        @InjectRepository(Attendance) private readonly attendanceRepository: Repository<Attendance>,
    ) {}

    /**
     * Announces, or amends an announcement already made.
     *
     * Amending rather than refusing a second notice: a parent who writes again has changed their
     * mind or their wording, not produced a second absence. `inTime` is recomputed on an amendment,
     * because the amendment is itself an act with a moment — a family that announces at nine and
     * corrects the reason at ten is still in time; one who first says anything after the class has
     * started is not, however early they meant to.
     */
    async announce(dto: AnnounceAbsenceDto, role: Role, userId: number, now: Date = new Date()): Promise<AbsenceNotice> {
        const child = await this.childRepository.findOne({
            where: { id: dto.childId },
            relations: { parent: { user: true } },
        });
        if (!child) throw new NotFoundException('Child not found');

        // The row-level rule of the whole codebase, in its narrowest form: a parent may speak for
        // their own children and for nobody else's. `?.` because a profile an admin typed in from a
        // phone call has no account behind it.
        //
        // **Unreachable today**, because the controller is `ADMIN`-only since the school made
        // recording an absence the office's job. It stays because it is the truth about the rows
        // rather than about the route: the day somebody reopens this to families — and the portal
        // button did exist once — the check has to already be here, not be remembered.
        if (role !== Role.ADMIN && child.parent.user?.id !== userId) {
            throw new NotFoundException('Child not found');
        }

        const session = await this.classSessionRepository.findOne({
            where: { id: dto.classSessionId },
            relations: { group: { children: true } },
        });
        if (!session) throw new NotFoundException('Class session not found');

        // Announcing an absence from a class the child does not attend is a mistyped id, not a
        // statement about anything. Checked against the group rather than against `Child.group`,
        // which is the derived column.
        if (!session.group.children.some((groupChild) => groupChild.id === child.id)) {
            throw new BadRequestException({
                message: 'Copilul nu e în grupa care ține ședința asta.',
                error: 'CHILD_NOT_IN_SESSION_GROUP',
            });
        }

        if (session.status === ClassSessionStatus.CANCELLED) {
            throw new ConflictException({
                message: 'Ședința e anulată — nu are cine să lipsească de la ea.',
                error: 'CLASS_SESSION_CANCELLED',
            });
        }

        // Once the register is taken, what happened is known, and a notice would be a claim about a
        // class whose truth is already written down.
        const marked = await this.attendanceRepository.findOne({
            where: { classSession: { id: session.id }, child: { id: child.id } },
        });
        if (marked) {
            throw new ConflictException({
                message: 'Prezența la ședința asta a fost deja marcată.',
                error: 'ATTENDANCE_ALREADY_MARKED',
            });
        }

        const existing = await this.noticeRepository.findOne({
            where: { child: { id: child.id }, classSession: { id: session.id } },
        });

        const notice = existing ?? new AbsenceNotice();
        notice.child = child;
        notice.classSession = session;
        notice.reason = dto.reason;
        notice.inTime = isInTime(session, now);
        notice.announcedBy = { id: userId } as User;

        const saved = await this.noticeRepository.save(notice);
        this.logger.log(`Absence announced for child ${child.id} at session ${session.id}; in time: ${saved.inTime}.`);
        return saved;
    }

    /**
     * Withdraws a notice — the child is coming after all.
     *
     * The ownership branch below is unreachable for the same reason as in `announce`, and stays for
     * the same reason.
     */
    async withdraw(id: number, role: Role, userId: number): Promise<{ message: string }> {
        const notice = await this.noticeRepository.findOne({
            where: { id },
            relations: { child: { parent: { user: true } } },
        });
        if (!notice) throw new NotFoundException('Absence notice not found');
        if (role !== Role.ADMIN && notice.child.parent.user?.id !== userId) {
            throw new NotFoundException('Absence notice not found');
        }

        await this.noticeRepository.delete(id);
        return { message: 'Anunțul a fost retras.' };
    }

    /**
     * The notices for one class, keyed by child — what the register needs to show them.
     *
     * A `Map` because the only caller asks "does this child have one?" once per row.
     */
    async forSession(classSessionId: number): Promise<Map<number, AbsenceNotice>> {
        const notices = await this.noticeRepository.find({
            where: { classSession: { id: classSessionId } },
            relations: { child: true },
        });
        return new Map(notices.map((notice) => [notice.child.id, notice]));
    }

    /**
     * Everything announced for classes that have not happened yet, soonest first.
     *
     * An admin gets the school; a parent gets their own children — narrowed here, in the service,
     * because a guard cannot express "the rows that are yours". Past notices are left out on
     * purpose: this list answers "who is missing this week", and a notice from October is history,
     * which the register already holds.
     */
    async upcoming(role: Role, userId: number, from: Date = new Date()): Promise<AbsenceNotice[]> {
        const qb = this.noticeRepository
            .createQueryBuilder('notice')
            .leftJoinAndSelect('notice.child', 'child')
            .leftJoinAndSelect('notice.classSession', 'session')
            .leftJoinAndSelect('session.group', 'group')
            // The move, with everything the family needs to act on it — E12/S4. The group is the
            // name they look for, the room and its location are where they drive to. Without this
            // join the portal would read every notice as "not yet placed", which is the one wrong
            // answer this list exists to avoid.
            .leftJoinAndSelect('notice.replacementSession', 'replacement')
            .leftJoinAndSelect('replacement.group', 'replacementGroup')
            .leftJoinAndSelect('replacement.room', 'replacementRoom')
            .leftJoinAndSelect('replacementRoom.location', 'replacementLocation')
            .andWhere('session.date >= :from', { from: from })
            .orderBy('session.date', 'ASC')
            .addOrderBy('session.startTime', 'ASC');

        if (role !== Role.ADMIN) {
            qb.leftJoin('child.parent', 'parent').leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
        }

        return qb.getMany();
    }
}
