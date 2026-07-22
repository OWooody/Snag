export interface SnagTheme {
  accent: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  danger: string;
  success: string;
}

export const defaultTheme: SnagTheme = {
  accent: "#5B4CF5",
  background: "#FFFFFF",
  surface: "#F4F3F8",
  text: "#1B1B24",
  textMuted: "#71717A",
  danger: "#DC2626",
  success: "#16A34A",
};
