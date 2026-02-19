import React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// Native select implementation - same API as Radix select but no external dependency
const SelectContext = React.createContext()

const Select = ({ value, onValueChange, children }) => {
  const [items, setItems] = React.useState([])
  const registerItem = React.useCallback((val, label) => {
    setItems(prev => {
      if (prev.some(i => i.value === val)) return prev
      return [...prev, { value: val, label }]
    })
  }, [])

  return (
    <SelectContext.Provider value={{ value, onValueChange, registerItem, items }}>
      {children}
    </SelectContext.Provider>
  )
}

const SelectValue = ({ placeholder }) => {
  const { value, items } = React.useContext(SelectContext)
  const selectedItem = items.find(i => i.value === value)
  return <>{selectedItem ? selectedItem.label : placeholder}</>
}

const SelectTrigger = React.forwardRef(({ className, children, ...props }, ref) => {
  const { value, onValueChange, items } = React.useContext(SelectContext)
  return (
    <div className={cn("relative", className)} ref={ref}>
      <div className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        {children}
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </div>
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        {...props}
      >
        {items.map(item => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
    </div>
  )
})
SelectTrigger.displayName = "SelectTrigger"

const SelectContent = ({ children }) => {
  // Content renders children to register items via useEffect, but hidden visually
  return <div className="hidden">{children}</div>
}

const SelectItem = React.forwardRef(({ value, children, ...props }, ref) => {
  const { registerItem } = React.useContext(SelectContext)
  React.useEffect(() => {
    registerItem(value, typeof children === 'string' ? children : value)
  }, [value, children, registerItem])
  return null
})
SelectItem.displayName = "SelectItem"

const SelectGroup = ({ children }) => <>{children}</>
const SelectLabel = React.forwardRef((props, ref) => null)
SelectLabel.displayName = "SelectLabel"
const SelectSeparator = React.forwardRef((props, ref) => null)
SelectSeparator.displayName = "SelectSeparator"
const SelectScrollUpButton = React.forwardRef((props, ref) => null)
SelectScrollUpButton.displayName = "SelectScrollUpButton"
const SelectScrollDownButton = React.forwardRef((props, ref) => null)
SelectScrollDownButton.displayName = "SelectScrollDownButton"

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
