"use client";

import { useTranslations } from "next-intl";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Icon } from "@kernel/core/components/ui/Icon";
import {
  deriveFilterLabel,
  FilterField,
  renderInToolbarSlot,
  useToolbarFilterSlot,
} from "@kernel/core/components/ui/ListToolbarFilters";
import { useLoadMoreOnScroll } from "@kernel/core/components/ui/LoadMoreSentinel";
import { cn } from "@kernel/core/lib/cn";

import { includesFolded } from "@/kernel/core/lib/search-text";

export interface DropdownOption {
  value: string;
  label: string;
  /** Leading glyph shown in its own fixed-width column, so labels line up whatever its width. */
  icon?: string;
}

export interface DropdownAsyncLoadProps {
  onSearch?: (query: string) => void;
  hasMore?: boolean;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export interface DropdownSelectProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  showFilterIcon?: boolean;
  /**
   * The caption a list filter carries in the toolbar's filter panel. Needed only when the
   * clear entry is a bare "All": otherwise the caption is read off that entry.
   */
  filterLabel?: string;
  fullWidth?: boolean;
  id?: string;
  allowCustomInput?: boolean;
  size?: "sm" | "md";
  allowClear?: boolean;
  clearValue?: string;
  placeholder?: string;
  asyncLoad?: DropdownAsyncLoadProps;
  searchable?: boolean;
  /** Runs each time the list opens — for options loaded only once someone wants them. */
  onOpen?: () => void;
}

interface DropdownMenuPosition {
  top: number;
  /** Set for a menu opening rightwards from the trigger's left edge. */
  left?: number;
  /** Set instead of `left` for a menu opening leftwards from the trigger's right edge. */
  right?: number;
  minWidth: number;
  /** Room left before the viewport edge the menu grows towards. */
  maxWidth: number;
  maxHeight: number;
  placement: "bottom" | "top";
}

const DROPDOWN_MENU_Z_INDEX = 110;
const DROPDOWN_MENU_GAP_PX = 6;
const DROPDOWN_MENU_MAX_HEIGHT_PX = 260;

/**
 * The surface is applied per state rather than in the base, because `cn` only joins class
 * names: a base `bg-surface-primary` and a disabled `bg-surface-secondary` would both reach
 * the element and the winner would be decided by stylesheet order.
 */
const triggerBase =
  "inline-flex items-center gap-1.5 border border-border-secondary text-text-secondary transition-[border,background-color,box-shadow] [font-family:inherit]";
const triggerEnabled = "bg-surface-primary";
const triggerInteractive =
  "cursor-pointer hover:border-border-primary hover:bg-surface-secondary";
const triggerOpen = "border-brand shadow-[0_0_0_2px_rgba(26,42,94,0.07)]";
/** Matches a read-only FormInput, so a field that cannot be changed always reads as one. */
const triggerDisabled = "cursor-not-allowed bg-surface-secondary opacity-60";

const sizeClasses = {
  sm: {
    input: "text-xs rounded px-2 py-1.5 pr-7",
    button: "text-xs rounded px-2 py-1.5",
    buttonFilter: "text-xs rounded px-2 py-1",
    chevronRight: "right-2",
  },
  md: {
    input: "text-sm rounded-[7px] px-3 py-2 pr-8",
    button: "text-sm rounded-[7px] px-3 py-2",
    buttonFilter: "text-sm rounded-[7px] h-9 px-2.5",
    chevronRight: "right-3",
  },
};

export function DropdownSelect({
  options: optionsProp,
  value,
  onChange,
  disabled = false,
  className,
  style,
  showFilterIcon = false,
  filterLabel,
  fullWidth = false,
  id,
  allowCustomInput = true,
  size = "md",
  allowClear,
  clearValue = "",
  placeholder,
  asyncLoad,
  searchable = true,
  onOpen,
}: DropdownSelectProps) {
  const tCommon = useTranslations("common");
  const inputPlaceholder = placeholder ?? tCommon("selectOrType");
  const [open, setOpen] = useState(false);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);
  useEffect(() => {
    if (open) onOpenRef.current?.();
  }, [open]);
  const [isFocused, setIsFocused] = useState(false);
  /**
   * The field only opens the list; searching happens in a box at the top of the list, which
   * takes focus only when the user clicks it (a phone raises no keyboard until then).
   */
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const loadMoreRef = useLoadMoreOnScroll<HTMLLIElement>({
    enabled: open && Boolean(asyncLoad?.hasMore),
    isLoading: asyncLoad?.isLoading || asyncLoad?.isLoadingMore,
    onLoadMore: asyncLoad?.onLoadMore,
    rootRef: listRef,
  });
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isSelectingRef = useRef(false);
  const asyncLoadRef = useRef(asyncLoad);

  useEffect(() => {
    asyncLoadRef.current = asyncLoad;
  }, [asyncLoad]);
  const isClearEnabled = allowClear ?? !showFilterIcon;
  /**
   * The clear affordance follows the held value, not the rendered label: an async picker
   * whose option list has been reset still holds a selection the user must be able to drop,
   * and a label that happens to read like the placeholder is still a real choice.
   */
  const hasClearableValue = value !== "" && value !== clearValue;
  const shouldShowClear = isClearEnabled && !disabled && hasClearableValue;

  // A list filter moves into its toolbar's filter panel, captioned from its clear entry. It
  // narrows the list whenever it holds a value, whether or not the field draws a clear icon.
  const clearOptionLabel = optionsProp.find(
    (opt) => opt.value === clearValue,
  )?.label;
  const filterAxis = filterLabel ?? deriveFilterLabel(clearOptionLabel);
  const heldLabel = optionsProp.find((opt) => opt.value === value)?.label;
  const filterSlot = useToolbarFilterSlot(
    {
      active: hasClearableValue && !disabled,
      reset: () => onChange(clearValue),
      chip: [filterAxis, heldLabel || value].filter(Boolean).join(": "),
    },
    showFilterIcon,
  );
  const inPanel = Boolean(filterSlot);

  /**
   * Under its caption in the panel, the clear entry reads a bare "All": the caption already
   * names the axis, so "Status: All" or "All statuses" under "Status" would repeat it.
   */
  const options = useMemo(() => {
    if (!inPanel || !filterAxis || clearOptionLabel === undefined) {
      return optionsProp;
    }
    return optionsProp.map((opt) =>
      opt.value === clearValue ? { ...opt, label: tCommon("allOption") } : opt,
    );
  }, [inPanel, filterAxis, clearOptionLabel, optionsProp, clearValue, tCommon]);

  const selected = options.find((opt) => opt.value === value) ?? null;
  /**
   * A typed-in value has no option to take a label from, so the raw value is what the field
   * shows. Without this a combobox looks empty the moment it loses focus, even though the
   * form still holds what was typed. A picker that only accepts listed values keeps showing
   * nothing, so an id never leaks into the field while its options are still loading.
   */
  const selectedLabel = (() => {
    if (selected && selected.value !== "") return selected.label;
    return allowCustomInput ? value : "";
  })();

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(clearValue);
    setInputValue("");
    setPanelSearch("");
    asyncLoadRef.current?.onSearch?.("");
  };

  const [inputValue, setInputValue] = useState(selectedLabel || value);
  const [panelSearch, setPanelSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<DropdownMenuPosition | null>(
    null,
  );
  const panelSearchRef = useRef<HTMLInputElement>(null);

  const updateMenuPosition = useCallback(() => {
    const trigger = containerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    // A phone browser's toolbars and keyboard cover the bottom of the layout viewport: the
    // visual viewport is what the user can actually see and tap.
    const viewportBottom = window.visualViewport
      ? window.visualViewport.offsetTop + window.visualViewport.height
      : window.innerHeight;
    const spaceBelow = viewportBottom - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const placement =
      spaceBelow < 160 && spaceAbove > spaceBelow ? "top" : "bottom";
    const availableSpace = placement === "bottom" ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(
      120,
      Math.min(
        DROPDOWN_MENU_MAX_HEIGHT_PX,
        availableSpace - DROPDOWN_MENU_GAP_PX,
      ),
    );

    // A trigger in the right half opens its menu leftwards, so a menu wider than the trigger
    // (every filter menu on a phone) grows into the screen instead of off its right edge.
    const opensLeftwards = rect.left + rect.width / 2 > window.innerWidth / 2;

    setMenuPosition({
      top:
        placement === "bottom"
          ? rect.bottom + DROPDOWN_MENU_GAP_PX
          : rect.top - DROPDOWN_MENU_GAP_PX,
      ...(opensLeftwards
        ? { right: window.innerWidth - rect.right }
        : { left: rect.left }),
      minWidth: rect.width,
      maxWidth: Math.max(
        rect.width,
        opensLeftwards
          ? rect.right - viewportPadding
          : window.innerWidth - rect.left - viewportPadding,
      ),
      maxHeight,
      placement,
    });
  }, [setMenuPosition]);

  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!isFocused && !open) {
      setInputValue(selectedLabel);
    }
  }

  const resolveInputToOption = () => {
    if (allowCustomInput) return;

    const trimmed = inputValue.trim().toLowerCase();
    if (!trimmed) {
      if (value === "") {
        setInputValue("");
        return;
      }
      setInputValue(selectedLabel);
      return;
    }

    const matched = options.find(
      (opt) =>
        opt.value !== "" &&
        (opt.label.toLowerCase() === trimmed ||
          opt.value.toLowerCase() === trimmed),
    );
    if (matched) {
      onChange(matched.value);
      setInputValue(matched.label);
      return;
    }

    setInputValue(selectedLabel);
  };

  const closeDropdown = () => {
    setOpen(false);
    setIsFocused(false);
    setPanelSearch("");
    setMenuPosition(null);
    asyncLoadRef.current?.onSearch?.("");
  };

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeDropdown();
      resolveInputToOption();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDropdown();
        resolveInputToOption();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, allowCustomInput, inputValue, options, onChange, value, selected]);

  const handleSelect = (nextValue: string) => {
    const opt = options.find((o) => o.value === nextValue);
    isSelectingRef.current = true;
    onChange(nextValue);
    setInputValue(opt?.label ?? nextValue);
    closeDropdown();
    requestAnimationFrame(() => {
      isSelectingRef.current = false;
    });
  };

  const isInputSearchMode = !showFilterIcon;
  const isEditing = isFocused || open;
  const isAsync = Boolean(asyncLoad);

  const displayOptions = useMemo(() => {
    let filtered = options;
    if (searchable && open && panelSearch.trim()) {
      const query = panelSearch.trim().toLowerCase();
      filtered = options.filter(
        (opt) => opt.value === "" || includesFolded(opt.label, query),
      );
    }

    if (!isInputSearchMode) return filtered;
    return filtered.filter((opt) => opt.value !== "");
  }, [isInputSearchMode, open, options, searchable, panelSearch]);

  useEffect(() => {
    if (!open) return;

    updateMenuPosition();

    const handleScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      // A phone scrolls the page to keep the list's search box above the keyboard it raised;
      // closing then would unmount the box and drop the keyboard the moment it opened.
      if (menuRef.current?.contains(document.activeElement)) return;
      closeDropdown();
      resolveInputToOption();
    };

    const handleResize = () => updateMenuPosition();

    window.addEventListener("resize", handleResize);
    // A phone keyboard resizes only the visual viewport, not the window.
    window.visualViewport?.addEventListener("resize", handleResize);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      document.removeEventListener("scroll", handleScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, updateMenuPosition, displayOptions.length]);

  useEffect(() => {
    optionRefs.current.length = displayOptions.length;
  }, [displayOptions.length]);

  useEffect(() => {
    if (!open) return;
    const index =
      displayOptions.length === 0
        ? -1
        : Math.min(Math.max(highlightedIndex, 0), displayOptions.length - 1);
    if (index >= 0) {
      optionRefs.current[index]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, open, displayOptions.length]);

  const activeHighlightIndex =
    displayOptions.length === 0
      ? -1
      : Math.min(Math.max(highlightedIndex, 0), displayOptions.length - 1);

  const selectHighlightedOption = () => {
    const option =
      activeHighlightIndex >= 0
        ? displayOptions[activeHighlightIndex]
        : undefined;
    if (option) {
      handleSelect(option.value);
    }
  };

  const handlePanelSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (displayOptions.length === 0) return;
      setHighlightedIndex((prev) =>
        prev >= displayOptions.length - 1 ? 0 : prev + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (displayOptions.length === 0) return;
      setHighlightedIndex((prev) =>
        prev <= 0 ? displayOptions.length - 1 : prev - 1,
      );
      return;
    }

    if (event.key === "Enter" && displayOptions.length > 0) {
      event.preventDefault();
      selectHighlightedOption();
      return;
    }

    // A free-text field takes the searched text itself when no option matches it.
    const typed = panelSearch.trim();
    if (
      event.key === "Enter" &&
      isInputSearchMode &&
      allowCustomInput &&
      typed
    ) {
      event.preventDefault();
      handleSelect(typed);
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    // The field itself takes no text: a key typed on it goes to the open list's search box.
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      if (open && searchable) panelSearchRef.current?.focus();
      else if (!open) openInputDropdown();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (displayOptions.length === 0) return;
      setHighlightedIndex((prev) =>
        prev >= displayOptions.length - 1 ? 0 : prev + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (displayOptions.length === 0) return;
      setHighlightedIndex((prev) =>
        prev <= 0 ? displayOptions.length - 1 : prev - 1,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (displayOptions.length > 0) {
        selectHighlightedOption();
      }
    }
  };

  const handleInputBlur = () => {
    if (isSelectingRef.current) return;

    window.setTimeout(() => {
      if (isSelectingRef.current) return;
      if (containerRef.current?.contains(document.activeElement)) return;
      // The list's search box is portalled outside the container.
      if (menuRef.current?.contains(document.activeElement)) return;

      setIsFocused(false);
      closeDropdown();
      resolveInputToOption();
    }, 0);
  };

  /**
   * The chosen option's row in the list as it opens — unsearched, and without the empty
   * placeholder option the input mode hides — so the highlight lands on the chosen row and
   * not one row past it.
   */
  const selectedOptionIndex = () => {
    const shown = isInputSearchMode
      ? options.filter((opt) => opt.value !== "")
      : options;
    return Math.max(
      0,
      shown.findIndex((opt) => opt.value === value),
    );
  };

  const openInputDropdown = () => {
    if (disabled) return;
    setIsFocused(true);
    setOpen(true);
    setInputValue(selectedLabel);
    setHighlightedIndex(selectedOptionIndex());
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openFilterDropdown = () => {
    setPanelSearch("");
    if (isAsync) asyncLoad?.onSearch?.("");
    // Start the highlight on the chosen option, not wherever it was left last time, so the
    // chosen row and the highlighted row never show as two shaded rows side by side.
    setHighlightedIndex(selectedOptionIndex());
    setOpen(true);
  };

  const field = (
    <div
      ref={containerRef}
      className={cn(
        "relative",
        fullWidth || inPanel ? "flex w-full" : "inline-flex",
        // A list's filter dropdowns pair up on a phone, two to a row, instead of each taking a
        // row of its own at its desktop width.
        showFilterIcon &&
          !fullWidth &&
          !inPanel &&
          "max-lg:min-w-0 max-lg:flex-[1_1_40%]",
        className,
      )}
      style={style}
    >
      {isInputSearchMode ? (
        <div
          className={cn("relative w-full", !disabled && "cursor-pointer")}
          onMouseDown={(e) => {
            if (disabled) return;
            if ((e.target as HTMLElement).closest("button")) return;
            if ((e.target as HTMLElement).closest("input")) return;
            e.preventDefault();
            openInputDropdown();
          }}
        >
          <input
            ref={inputRef}
            id={id}
            type="text"
            disabled={disabled}
            readOnly
            value={isEditing ? inputValue : selectedLabel}
            onFocus={() => {
              openInputDropdown();
            }}
            onMouseDown={() => {
              /**
               * Selecting an option keeps DOM focus on the input, so a later click fires no
               * focus event and the menu would stay shut until the field lost focus first.
               */
              if (disabled || open) return;
              openInputDropdown();
            }}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            className={cn(
              triggerBase,
              !disabled && triggerEnabled,
              sizeClasses[size].input,
              (() => {
                if (!shouldShowClear) return "";
                return size === "sm" ? "pr-10" : "pr-14";
              })(),
              "w-full justify-between text-left focus:outline-none focus:border-brand focus:ring-0",
              !disabled &&
                "cursor-pointer hover:border-border-primary hover:bg-surface-secondary",
              // The field reads as a button: no caret, no text highlight.
              "select-none caret-transparent",
              open && !disabled && triggerOpen,
              disabled && triggerDisabled,
            )}
            placeholder={inputPlaceholder}
          />
          <div
            className={cn(
              "pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-text-tertiary",
              sizeClasses[size].chevronRight,
            )}
          >
            {shouldShowClear && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  handleClear(e);
                  setHighlightedIndex(0);
                  setIsFocused(true);
                  setOpen(true);
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
                className="pointer-events-auto cursor-pointer text-[#9CA3AF] hover:text-text-primary p-0.5 rounded hover:bg-black/5 flex items-center justify-center transition-colors shrink-0"
                title={tCommon("clear")}
              >
                <Icon name="x" size={size === "sm" ? 12 : 14} />
              </button>
            )}
            <Icon
              name="chevron-down"
              size={size === "sm" ? 12 : 14}
              className={cn(
                "transition-transform duration-150 pointer-events-none",
                open && "rotate-180",
              )}
            />
          </div>
        </div>
      ) : (
        <div
          id={id}
          role="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (open) closeDropdown();
              else openFilterDropdown();
            }
          }}
          onClick={() => {
            if (disabled) return;
            if (open) {
              closeDropdown();
              return;
            }
            openFilterDropdown();
          }}
          className={cn(
            triggerBase,
            !disabled && triggerEnabled,
            showFilterIcon
              ? cn(
                  sizeClasses[size].buttonFilter,
                  inPanel
                    ? "w-full min-w-0 max-lg:h-10"
                    : "min-w-[180px] max-lg:h-10 max-lg:w-full max-lg:min-w-0",
                  // A filter that narrows the list says so at a glance.
                  shouldShowClear &&
                    "border-brand/40 bg-brand-light text-brand hover:border-brand/60 hover:bg-brand-light [&_span]:text-brand [&_svg]:text-brand",
                )
              : cn("w-full justify-between", sizeClasses[size].button),
            !disabled && triggerInteractive,
            !disabled && "cursor-pointer",
            open && !disabled && triggerOpen,
            disabled && triggerDisabled,
            "focus:outline-none focus:border-brand focus:shadow-[0_0_0_2px_rgba(26,42,94,0.07)]",
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-1.5 pr-2">
            {showFilterIcon && !inPanel && (
              <Icon
                name="filter"
                size={size === "sm" ? 12 : 14}
                className="shrink-0 text-text-tertiary"
              />
            )}
            <span className="truncate text-left text-text-primary">
              {selectedLabel || value || ""}
            </span>
          </span>
          <div className="flex items-center gap-1.5 shrink-0 text-text-tertiary">
            {shouldShowClear && (
              <button
                type="button"
                onClick={handleClear}
                className="cursor-pointer text-[#9CA3AF] hover:text-text-primary p-0.5 rounded hover:bg-black/5 flex items-center justify-center transition-colors"
                title={tCommon("clear")}
              >
                <Icon name="x" size={size === "sm" ? 12 : 14} />
              </button>
            )}
            <Icon
              name="chevron-down"
              size={size === "sm" ? 12 : 14}
              className={cn(
                "transition-transform duration-150",
                open && "rotate-180",
              )}
            />
          </div>
        </div>
      )}

      {open &&
        menuPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            onMouseDown={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest("input")) return;
              e.preventDefault();
            }}
            style={{
              position: "fixed",
              top: menuPosition.top,
              left: menuPosition.left,
              right: menuPosition.right,
              minWidth: menuPosition.minWidth,
              maxWidth: `min(28rem, ${menuPosition.maxWidth}px)`,
              // The cap covers the search box too, so the whole menu fits the space measured.
              maxHeight: menuPosition.maxHeight,
              zIndex: DROPDOWN_MENU_Z_INDEX,
              transform:
                menuPosition.placement === "top"
                  ? "translateY(-100%)"
                  : undefined,
            }}
            className="flex w-max flex-col overflow-hidden rounded-xl border border-border-secondary/80 bg-surface-primary shadow-[0_12px_32px_rgba(15,23,42,0.14)]"
          >
            {searchable && (
              <div className="shrink-0 border-b border-border-tertiary bg-surface-secondary/50 px-3 py-2.5">
                <div className="flex items-center gap-2 rounded-lg bg-surface-primary px-2.5 py-1.5 shadow-[inset_0_0_0_1px_rgba(209,213,219,0.9)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_rgba(26,42,94,0.35),0_0_0_2px_rgba(26,42,94,0.08)]">
                  <Icon
                    name="search"
                    size={14}
                    className="shrink-0 text-text-tertiary"
                  />
                  <input
                    ref={panelSearchRef}
                    type="text"
                    autoComplete="off"
                    value={panelSearch}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const query = e.target.value;
                      setPanelSearch(query);
                      setHighlightedIndex(0);
                      if (isAsync) asyncLoad?.onSearch?.(query);
                    }}
                    onKeyDown={handlePanelSearchKeyDown}
                    onBlur={isInputSearchMode ? handleInputBlur : undefined}
                    placeholder={tCommon("search")}
                    className={cn(
                      "w-full border-none bg-transparent outline-none placeholder:text-text-tertiary [font-family:inherit]",
                      size === "sm" ? "text-xs" : "text-sm",
                      "text-text-primary",
                    )}
                  />
                </div>
              </div>
            )}
            <ul
              ref={listRef}
              className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5"
            >
              {asyncLoad?.isLoading && displayOptions.length === 0 && (
                <li
                  className={cn(
                    "text-text-tertiary text-center",
                    size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
                  )}
                >
                  {tCommon("loading")}
                </li>
              )}
              {displayOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === activeHighlightIndex;
                let optionClass =
                  "rounded-md text-text-primary hover:bg-surface-secondary";
                if (isHighlighted) {
                  optionClass = "rounded-md bg-brand-50 text-brand font-medium";
                } else if (isSelected) {
                  optionClass =
                    "rounded-md bg-brand-50/60 font-medium text-brand";
                }

                return (
                  <li key={`${opt.value}-${idx}`} role="presentation">
                    <button
                      ref={(el) => {
                        optionRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      // Only a real mouse moves the highlight: a tap on a touch screen also
                      // fires a compatibility mouseenter, which would leave a second row shaded.
                      onPointerEnter={(e) => {
                        if (e.pointerType === "mouse") setHighlightedIndex(idx);
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect(opt.value);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between gap-2 text-left transition-colors [font-family:inherit]",
                        size === "sm"
                          ? "px-2.5 py-1.5 text-xs"
                          : "px-2.5 py-2 text-sm",
                        optionClass,
                      )}
                    >
                      {opt.icon !== undefined && (
                        <span
                          aria-hidden="true"
                          className="w-5 shrink-0 text-center leading-snug"
                        >
                          {opt.icon}
                        </span>
                      )}
                      <span className="flex-1 whitespace-nowrap leading-snug">
                        {opt.label}
                      </span>
                      {isSelected && (
                        <Icon
                          name="check"
                          size={14}
                          className="shrink-0 text-brand"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
              {asyncLoad?.hasMore && displayOptions.length > 0 && (
                <li
                  ref={loadMoreRef}
                  aria-hidden
                  className={cn(
                    "text-text-tertiary text-center",
                    size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
                    !asyncLoad.isLoadingMore && "h-1 py-0",
                  )}
                >
                  {asyncLoad.isLoadingMore ? tCommon("loading") : null}
                </li>
              )}
              {!asyncLoad?.isLoading && displayOptions.length === 0 && (
                <li
                  className={cn(
                    "text-text-tertiary italic text-center",
                    size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
                  )}
                >
                  {tCommon("noResults")}
                </li>
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );

  return renderInToolbarSlot(
    filterSlot,
    <FilterField label={filterAxis}>{field}</FilterField>,
    field,
  );
}
