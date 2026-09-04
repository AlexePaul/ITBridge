import { Module } from '@nestjs/common';
import { EntitiesModule } from 'src/entities/entities.module';
import { LeadProgressService } from './lead-progress.service';

/**
 * The half of the lead story that other modules call into — E20/S1.
 *
 * Separated from `LeadModule` because the dependency runs both ways otherwise: booking a trial needs
 * `EnrollmentService`, while enrolment and attendance need to tell a lead what happened. This module
 * imports nothing but the entities, so both sides can have it.
 */
@Module({
    imports: [EntitiesModule],
    providers: [LeadProgressService],
    exports: [LeadProgressService],
})
export class LeadProgressModule {}
