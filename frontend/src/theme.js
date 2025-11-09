// Design System Theme
export const colors = {
  // Primary
  background: '#FFFFFF',
  accent: '#FFD700',
  accentHover: '#FFC700',
  accentActive: '#FFB700',
  
  // Text
  text: {
    primary: '#1A2233',
    secondary: '#4A5568',
    tertiary: '#8A92A0',
    light: '#C5CBD2'
  },
  
  // Status
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  
  // Backgrounds
  surface: '#F8F9FA',
  border: '#E5E7EB',
  shadow: 'rgba(26, 34, 51, 0.08)'
}

export const typography = {
  // Headings - Oswald
  h1: {
    fontFamily: '"Oswald", sans-serif',
    fontSize: '32px',
    fontWeight: 700,
    lineHeight: '1.2',
    letterSpacing: '-0.5px'
  },
  h2: {
    fontFamily: '"Oswald", sans-serif',
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: '1.3',
    letterSpacing: '-0.3px'
  },
  h3: {
    fontFamily: '"Oswald", sans-serif',
    fontSize: '20px',
    fontWeight: 600,
    lineHeight: '1.4',
    letterSpacing: '0px'
  },
  
  // Body
  body: {
    fontFamily: '"Oswald", sans-serif',
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '1.6'
  },
  
  // Small
  small: {
    fontFamily: '"Oswald", sans-serif',
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '1.5'
  },
  
  // Button
  button: {
    fontFamily: '"Oswald", sans-serif',
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: '1.4',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  }
}

export const shadows = {
  sm: `0 1px 2px ${colors.shadow}`,
  md: `0 4px 6px ${colors.shadow}`,
  lg: `0 10px 15px ${colors.shadow}`,
  xl: `0 20px 25px ${colors.shadow}`
}

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px'
}

export const borderRadius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px'
}

export const breakpoints = {
  mobile: '320px',
  tablet: '768px',
  desktop: '1024px',
  wide: '1440px'
}

export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)'
}
