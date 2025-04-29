export const theme = {
  colors: {
    primary: {
      main: '#295c51',
      hover: '#1e453c',
      light: '#295c51/5',
    },
    text: {
      primary: '#1a1a1a',
      secondary: '#666666',
      muted: '#888888',
    },
    background: {
      main: '#ffffff',
      secondary: '#f9fafb',
      hover: '#f3f4f6',
    },
    border: {
      main: '#e5e7eb',
      hover: '#d1d5db',
    },
    status: {
      success: {
        text: '#047857',
        bg: '#ecfdf5',
        border: '#a7f3d0',
      },
      error: {
        text: '#dc2626',
        bg: '#fef2f2',
        border: '#fecaca',
      },
      warning: {
        text: '#d97706',
        bg: '#fffbeb',
        border: '#fde68a',
      },
      info: {
        text: '#2563eb',
        bg: '#eff6ff',
        border: '#bfdbfe',
      },
    },
  },
  fonts: {
    sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    heading: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  fontSizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
  },
  fontWeights: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

export type Theme = typeof theme; 