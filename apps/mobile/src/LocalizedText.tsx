import { Children, forwardRef, type ReactNode } from "react";
import { Text as NativeText, TextInput as NativeTextInput, type TextInputProps, type TextProps } from "react-native";

import { useLanguage } from "./LanguageContext";

function translateChildren(children: ReactNode, translate: (value: string) => string): ReactNode {
  return Children.map(children, (child) => typeof child === "string" ? translate(child) : child);
}

export function LocalizedText({ children, ...props }: TextProps) {
  const { translate } = useLanguage();
  return <NativeText {...props}>{translateChildren(children, translate)}</NativeText>;
}

export const LocalizedTextInput = forwardRef<NativeTextInput, TextInputProps>(function LocalizedTextInput({ placeholder, ...props }, ref) {
  const { translate } = useLanguage();
  return <NativeTextInput ref={ref} placeholder={placeholder ? translate(placeholder) : placeholder} {...props} />;
});
