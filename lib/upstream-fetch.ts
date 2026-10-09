// One explicit transport seam lets runtime tests intercept only upstream
// content requests without altering global fetch or framework behavior.
export const upstreamFetch: typeof fetch = (...args) => fetch(...args)
