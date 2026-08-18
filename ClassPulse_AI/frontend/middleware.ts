import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// These routes stay public — no login required
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/pricing',
  '/room/(.*)',          // students can join without an account
  '/api/webhook(.*)',
  '/api/health',
  '/',                   // landing/teacher page — stays public for now
]);

export default clerkMiddleware(async (auth, req) => {
  // Only enforce auth on protected routes (billing, admin, profile, onboarding)
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
