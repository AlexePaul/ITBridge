import { PartialType } from '@nestjs/swagger';
import { CreateLocationDto } from './createLocation.dto';

/**
 * Every field optional, derived rather than copied.
 *
 * The hand-written update DTOs elsewhere in this codebase are where a missing `@IsOptional()` hid
 * for as long as validation was switched off: `updateGroup.dto.ts` still carries the comment about
 * it. `PartialType` applies `@IsOptional()` to every inherited field by construction, so the same
 * omission cannot happen here, and the two shapes cannot drift apart when a field is added.
 */
export class UpdateLocationDto extends PartialType(CreateLocationDto) {}
