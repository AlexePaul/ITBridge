import { EventSubscriber, EntitySubscriberInterface, InsertEvent } from 'typeorm';
import { randomBytes } from 'crypto';
import { Profile } from './profile.entity';

/**
 * Gives every profile its unsubscribe token, whichever door it was written through — E17 S4.
 *
 * A subscriber rather than `@BeforeInsert` on the entity, and the difference is not stylistic: an
 * entity hook only runs when the thing being saved is an *instance* of the class, and half this
 * codebase writes profiles as plain object literals — `manager.save(Profile, { firstName, ... })`
 * in `register`, in the trial booking, in `ProfileService`. Measured, not assumed: with the hook,
 * `register` failed on the not-null constraint. A subscriber runs on the persistence subject, so it
 * fires for both shapes.
 *
 * Which matters because the column is `NOT NULL`: a family with no token is a family the law says
 * we may not send marketing to, and the fifth place that creates a profile should inherit the
 * guarantee rather than have to remember it.
 */
@EventSubscriber()
export class ProfileTokenSubscriber implements EntitySubscriberInterface<Profile> {
    listenTo() {
        return Profile;
    }

    beforeInsert(event: InsertEvent<Profile>): void {
        // Only when absent. The seed writes its own, and an insert that already carries one is a
        // row being rewritten with a token some e-mail is already holding.
        if (!event.entity.unsubscribeToken) {
            event.entity.unsubscribeToken = randomBytes(32).toString('base64url');
        }
    }
}
