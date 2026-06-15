// The onboarding reveal flow manages its own in-flow loading (the connect / pending /
// reveal screens). Returning null here keeps the parent dashboard skeleton from flashing
// over it, preserving the onboarding look unchanged.
export default function Loading() {
  return null;
}
