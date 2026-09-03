/**
 * How often a family wants to hear from the school — E17/S4, built in S6.
 *
 * This is about **packaging, never about delivery.** Nothing here can stop a message: a family on
 * `WEEKLY` receives everything a family on `IMMEDIATE` does, in fewer envelopes. That distinction is
 * the whole reason the preference is safe to default to something other than "send everything at
 * once" — and it is why urgent messages ignore it entirely rather than being exempted case by case.
 *
 * `DAILY` is the default, and that is a decision rather than a shrug. E17's risk section calls too
 * many messages the way the channel gets lost — „S6 nu e o rafinare, e o cerință de la început" —
 * and the story's acceptance is stated unconditionally: a parent with two children does not get more
 * than one email a day. A default of `IMMEDIATE` would make that true only of the families who went
 * looking for a setting.
 */
export enum MessageFrequency {
    /** Each message as it happens. Nothing is held; the digest pass releases on its next tick. */
    IMMEDIATE = 'immediate',
    /** One combined message in the evening, for everything that accumulated that day. */
    DAILY = 'daily',
    /** One combined message on Monday evening. Anything with a deadline still leaves before it. */
    WEEKLY = 'weekly',
}
