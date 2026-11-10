import './StarPortalButton.css'

export default function StarPortalButton({
  children,
  size = 'regular',
  startIcon,
  endIcon,
  className = '',
  type = 'button',
  ...buttonProps
}) {
  const classes = ['star-portal-button', `star-portal-button--${size}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={classes} type={type} {...buttonProps}>
      <span className="star-portal-button__rim" aria-hidden="true" />
      <span className="star-portal-button__content">
        {startIcon && <span className="star-portal-button__icon" aria-hidden="true">{startIcon}</span>}
        <span>{children}</span>
        {endIcon && <span className="star-portal-button__icon" aria-hidden="true">{endIcon}</span>}
      </span>
    </button>
  )
}
