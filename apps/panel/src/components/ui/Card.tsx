import type { HTMLAttributes, ReactNode } from "react";
import "./Card.css";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
  hoverable?: boolean;
}

export default function Card({
  children,
  padded = true,
  hoverable = false,
  className = "",
  ...rest
}: CardProps) {
  const classes = [
    "card",
    padded ? "card-padded" : "",
    hoverable ? "card-hoverable" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
