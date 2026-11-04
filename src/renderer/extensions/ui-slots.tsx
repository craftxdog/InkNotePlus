import { Component, createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { UiRegistry, type UiLayout } from './ui-registry';

const UiContext = createContext<UiRegistry | null>(null);
export function UiProvider({
  registry,
  children,
}: {
  registry: UiRegistry;
  children: ReactNode;
}) {
  return <UiContext value={registry}>{children}</UiContext>;
}
export function UiSlot({ name }: { name: UiLayout }) {
  const registry = useContext(UiContext);
  if (!registry) return null;
  return <RegisteredSlot registry={registry} name={name} />;
}
function RegisteredSlot({
  registry,
  name,
}: {
  registry: UiRegistry;
  name: UiLayout;
}) {
  useStore(registry.store, (state) => state.revision);
  return registry
    .getLayout(name)
    .map(({ name: componentName, component: View }) => (
      <ExtensionBoundary key={`${name}/${componentName}`}>
        <View />
      </ExtensionBoundary>
    ));
}
class ExtensionBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <span role="alert" className="extension-error">
        No se pudo cargar el componente.
      </span>
    ) : (
      this.props.children
    );
  }
}
