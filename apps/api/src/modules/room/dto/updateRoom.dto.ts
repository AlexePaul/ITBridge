import { PartialType } from '@nestjs/swagger';
import { CreateRoomDto } from './createRoom.dto';

/** Every field optional; see the note on `UpdateLocationDto` for why this is derived. */
export class UpdateRoomDto extends PartialType(CreateRoomDto) {}
