import { lazy, Suspense, type ComponentType } from "react"
export default function dynamic<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, options?: { ssr?: boolean; loading?: ComponentType }) {
  const Component = lazy(load)
  const Loading = options?.loading
  return function LazyComponent(props: P) { return <Suspense fallback={Loading ? <Loading /> : null}><Component {...props} /></Suspense> }
}
