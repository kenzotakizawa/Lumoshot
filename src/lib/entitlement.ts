// Single source of truth for premium entitlement.
//
// The web app is currently 100% free, so this always returns true. When billing
// is introduced later, swap the implementation here (e.g. validate a license key
// via Lemon Squeezy and cache the result) WITHOUT touching feature code — gate
// premium features behind `isPro()`.
export function isPro(): boolean {
    return true;
}
