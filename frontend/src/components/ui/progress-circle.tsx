import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressCircleProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  size?: "sm" | "md" | "lg"
  showValue?: boolean
  strokeWidth?: number
}

const sizeMap = {
  sm: 64,
  md: 80,
  lg: 96,
}

export function ProgressCircle({
  value,
  size = "md",
  showValue = true,
  strokeWidth = 4,
  className,
  ...props
}: ProgressCircleProps) {
  const dimension = sizeMap[size]
  const radius = (dimension - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: dimension, height: dimension }}
      {...props}
    >
      <svg
        className="transform -rotate-90"
        style={{ width: dimension, height: dimension }}
      >
        {/* Background circle */}
        <circle
          className="text-gray-100"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          r={radius}
          cx={dimension / 2}
          cy={dimension / 2}
        />
        {/* Progress circle */}
        <circle
          className="text-[#295c51] transition-all duration-300 ease-in-out"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
          r={radius}
          cx={dimension / 2}
          cy={dimension / 2}
        />
      </svg>
      {showValue && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-medium">{Math.round(value)}%</span>
        </div>
      )}
    </div>
  )
} 