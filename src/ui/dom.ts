type Child = Node | string

type Props = {
  class?: string
  text?: string
  attrs?: Record<string, string>
  on?: Partial<Record<'click' | 'change' | 'input', () => void>>
}

/** Creates an element. Text always goes in as text, never as HTML. */
export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag)
  if (props.class !== undefined) element.className = props.class
  if (props.text !== undefined) element.textContent = props.text
  for (const [name, value] of Object.entries(props.attrs ?? {})) element.setAttribute(name, value)
  for (const [type, listener] of Object.entries(props.on ?? {})) element.addEventListener(type, listener)
  element.append(...children)
  return element
}
