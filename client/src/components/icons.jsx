function Icon({ size = 20, strokeWidth = 1.6, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const SnowIcon = (props) => (
  <Icon {...props}><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1" /></Icon>
)

export const FanIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="2" />
    <path d="M12 10c0-4 2-7 4-7s2 4-1 6M14 12c4 0 7 2 7 4s-4 2-6-1M12 14c0 4-2 7-4 7s-2-4 1-6M10 12c-4 0-7-2-7-4s4-2 6 1" />
  </Icon>
)

export const BackIcon = (props) => (
  <Icon size={22} strokeWidth={2} {...props}><path d="M15 5l-7 7 7 7" /></Icon>
)

export const ChevronIcon = (props) => (
  <Icon size={16} strokeWidth={2} {...props}><path d="M9 5l7 7-7 7" /></Icon>
)

export const PowerIcon = (props) => (
  <Icon strokeWidth={2.2} {...props}><path d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0" /></Icon>
)

export const TimerIcon = (props) => (
  <Icon strokeWidth={1.8} {...props}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9 2h6" />
  </Icon>
)

export const GearIcon = (props) => (
  <Icon strokeWidth={1.8} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.8-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.8H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.8-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.8h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.1z" />
  </Icon>
)

export const RefreshIcon = (props) => (
  <Icon strokeWidth={1.8} {...props}><path d="M20 11a8 8 0 1 0-2.3 6.3M20 4v7h-7" /></Icon>
)

export const BulbIcon = (props) => (
  <Icon strokeWidth={1.8} {...props}>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
  </Icon>
)
