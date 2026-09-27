import type { ClientErrorKind } from "~/types/error-report.types";
import { useErrorsApi } from "~/composables/api/useErrorsApi";
import {
  componentTrail,
  createErrorReporter,
  serverReference,
} from "~/composables/useErrorReporter";
import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";

/**
 * A screen that breaks says so, and the office hears about it — E06 S1.
 *
 * Vue drops a component that throws while it renders and carries on around the hole, so a broken
 * screen used to be a screen with a piece missing and nothing else: the family saw an empty
 * calendar, the office an empty table, and the only trace was a line in a console nobody opens.
 * Now the error goes to `/admin/erori` with the page and the component it happened in, and the
 * reader gets a toast with the code it went under — which is what they read out over the phone.
 *
 * Only for somebody signed in: the route takes a token, and the public pages hold nothing that
 * breaks this way. Never throws, and never loops — see `createErrorReporter`.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const tokenStore = useTokenStore();
  const userStore = useUserStore();
  const errorsApi = useErrorsApi();
  const router = useRouter();
  const toast = useToast();
  // The code the error page shows, when an error is what took the reader there.
  const reference = useState<string | null>("errorReference", () => null);

  const reporter = createErrorReporter((body) => errorsApi.reportClientError(body));

  const capture = (error: unknown, kind: ClientErrorKind, instance?: unknown) => {
    try {
      const recordedByServer = serverReference(error);
      if (recordedByServer) {
        reference.value = recordedByServer;
        return;
      }
      if (!tokenStore.accessToken && !tokenStore.refreshToken) return;

      const route = router.currentRoute.value;
      const isAdmin = userStore.user?.role === "ADMIN";
      // The toast waits for the server: "am notat, cu codul X" is only true once the row exists.
      const sent: string | null = reporter.report(
        error,
        kind,
        {
          route: route.matched.at(-1)?.path ?? route.path,
          path: route.fullPath,
          component: componentTrail(instance),
        },
        (delivered) => {
          if (!sent) return;
          if (!delivered) {
            if (reference.value === sent) reference.value = null;
            toast.add({
              title: "Ceva n-a mers pe ecranul acesta",
              description:
                "Reîncarcă pagina. Nu am putut nota eroarea — dacă se repetă, spune-ne ce ai apăsat și la ce oră.",
              color: "error",
              icon: "i-lucide-triangle-alert",
            });
            return;
          }
          toast.add({
            title: "Ceva n-a mers pe ecranul acesta",
            description: isAdmin
              ? `Eroarea e notată în Erori, cu codul ${sent}. Reîncarcă pagina.`
              : `Am notat eroarea, cu codul ${sent}. Reîncarcă pagina; dacă se repetă, spune-ne codul.`,
            color: "error",
            icon: "i-lucide-triangle-alert",
            ...(isAdmin
              ? { actions: [{ label: "Vezi eroarea", to: `/admin/erori?cod=${sent}` }] }
              : {}),
          });
        }
      );
      if (!sent) return;
      reference.value = sent;
    } catch {
      // A report about a broken screen must not break it further.
    }
  };

  // A code belongs to the screen it came from: leaving it clears it, so the error page never shows
  // an earlier, unrelated one (review of 27 September 2026).
  router.afterEach(() => {
    reference.value = null;
  });

  nuxtApp.hook("vue:error", (error, instance) => capture(error, "vue", instance));
  nuxtApp.hook("app:error", (error) => capture(error, "vue"));
  window.addEventListener("unhandledrejection", (event) =>
    capture(event.reason, "unhandledrejection")
  );
  // Only errors with an object behind them: a cross-origin script reports „Script error." and
  // nothing else, and a failed image does not bubble here at all.
  window.addEventListener("error", (event) => {
    if (event.error) capture(event.error, "window");
  });
});
