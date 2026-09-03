import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length } from 'class-validator';
import { AnnouncementAudience } from 'src/enum/announcement-audience.enum';
import { MessageKind } from 'src/enum/message-kind.enum';

/**
 * What an admin writes on the announcement screen — E17/S7.
 *
 * The same body serves preview, test send and the broadcast itself: previewing something other than
 * what will be sent is the one way a preview can lie, and the story leans on the preview as the
 * place a leaked name gets caught.
 */
export class SendAnnouncementDto {
    @ApiProperty({ enum: AnnouncementAudience, description: 'A group, an address, or every family with a child in a group' })
    @IsEnum(AnnouncementAudience)
    audience: AnnouncementAudience;

    /** Required when `audience` is `group`; the service refuses the mismatch rather than ignoring it. */
    @ApiPropertyOptional({ description: 'Which group, when the audience is a group' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    groupId?: number;

    @ApiPropertyOptional({ description: 'Which location, when the audience is a location' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    locationId?: number;

    /**
     * Operational or marketing — E17/S4.
     *
     * Asked, not inferred, and it decides whether `Profile.marketingOptIn` is consulted. „Sâmbătă e
     * zi liberă" is the school performing its contract and reaches everyone; „vino la ziua porților
     * deschise" is not, and reaches the families who said yes. Nothing in the text can tell the two
     * apart, so the person writing it says which one it is.
     *
     * Defaults to transactional, the same safe direction as everywhere else in E17: a sender that
     * says nothing about itself keeps sending.
     */
    @ApiPropertyOptional({ enum: MessageKind, default: MessageKind.TRANSACTIONAL })
    @IsOptional()
    @IsEnum(MessageKind)
    kind?: MessageKind;

    @ApiProperty({ example: 'Sâmbătă, 12 martie, nu se țin cursuri' })
    @IsString()
    @Length(3, 255)
    subject: string;

    /**
     * The middle of the message. The greeting and the signature are added per recipient, so this is
     * prose and nothing else — no `{{placeholders}}`, which would be a template language in a
     * textarea with nobody left downstream to catch a typo.
     */
    @ApiProperty({ example: 'Sâmbătă este zi liberă, iar orele se reiau luni la orele obișnuite.' })
    @IsString()
    @Length(10, 4000)
    body: string;

    /**
     * The second press, after a warning — the same shape as E11/S6's age check.
     *
     * Only the child-name warning can be acknowledged. A duplicate announcement is refused outright:
     * there is no sentence an admin could read that would make sending the same words to the same
     * families twice in one day the intended outcome.
     */
    @ApiPropertyOptional({ description: 'Send despite the warnings the preview reported', default: false })
    @IsOptional()
    @IsBoolean()
    acknowledgeWarnings?: boolean;
}
