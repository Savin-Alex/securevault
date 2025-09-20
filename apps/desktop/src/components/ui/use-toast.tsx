import * as React from "react"

export interface ToastProps {
  title?: string
  description?: string
  variant?: "default" | "destructive"
}

export function toast({ title, description, variant = "default" }: ToastProps) {
  // Simple toast implementation - in a real app you'd use a toast library
  const toastElement = document.createElement("div")
  toastElement.className = `fixed top-4 right-4 z-50 p-4 rounded-md shadow-lg ${
    variant === "destructive" 
      ? "bg-red-500 text-white" 
      : "bg-green-500 text-white"
  }`
  
  if (title) {
    const titleElement = document.createElement("div")
    titleElement.className = "font-semibold"
    titleElement.textContent = title
    toastElement.appendChild(titleElement)
  }
  
  if (description) {
    const descElement = document.createElement("div")
    descElement.className = "text-sm opacity-90"
    descElement.textContent = description
    toastElement.appendChild(descElement)
  }
  
  document.body.appendChild(toastElement)
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    if (toastElement.parentNode) {
      toastElement.parentNode.removeChild(toastElement)
    }
  }, 3000)
}
