
import * as React from "react";

export type ContentEditableTextareaProps = {
    /** Controlled value */
    value?: string;
    /** Uncontrolled initial value */
    defaultValue?: string;
    /** Called whenever text changes */
    onChange?: (text: string) => void;

    placeholder?: string;
    disabled?: boolean;

    className?: string;
    style?: React.CSSProperties;

    name?: string;

    /**
     * Optional: called when focused/blurred
     */
    onFocus?: React.FocusEventHandler<HTMLDivElement>;
    onBlur?: React.FocusEventHandler<HTMLDivElement>;

    /**
     * Optional: keep newlines, default true.
     * If false, Enter won’t create line breaks.
     */
    multiline?: boolean;
};

export type ContentEditableTextareaRef = {
    /** Reset text to empty */
    clearText: () => void;
    /** Programmatically set text */
    setText: (text: string) => void;
    /** Focus/blur helpers */
    focus: () => void;
    blur: () => void;
};

export const ContentEditableTextarea = React.forwardRef<
    ContentEditableTextareaRef,
    ContentEditableTextareaProps
>(function ContentEditableTextarea(
    {
        value,
        defaultValue,
        onChange,
        placeholder,
        disabled,
        className,
        style,
        name,
        onFocus,
        onBlur,
        multiline = true,
    },
    ref
) {
    const innerRef = React.useRef<HTMLDivElement | null>(null);

    const isControlled = value != null;

    // Keep DOM in sync with controlled value
    React.useLayoutEffect(() => {
        if (!innerRef.current) return;
        if (!isControlled) return;

        const domText = innerRef.current.textContent ?? "";
        if (domText !== value) {
            innerRef.current.textContent = value ?? "";
        }
    }, [isControlled, value]);

    // Initialize uncontrolled defaultValue
    React.useEffect(() => {
        if (!innerRef.current) return;
        if (isControlled) return;

        if ((innerRef.current.textContent ?? "") === "") {
            innerRef.current.textContent = defaultValue ?? "";
        }
        // only once on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const emitChange = React.useCallback(() => {
        const text = innerRef.current?.textContent ?? "";
        onChange?.(text);
    }, [onChange]);

    const handleInput: React.FormEventHandler<HTMLDivElement> = () => {
        // For uncontrolled, we just emit; for controlled, parent will set value.
        emitChange();
    };

    const handlePaste: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
        // Paste plain text only (prevents weird formatting)
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        insertTextAtCursor(text);
        emitChange();
    };

    const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
        if (!multiline && e.key === "Enter") {
            e.preventDefault();
        }
    };

    // Helper to insert text at caret in contentEditable
    function insertTextAtCursor(text: string) {
        const el = innerRef.current;
        if (!el) return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            el.textContent = (el.textContent ?? "") + text;
            return;
        }

        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        // move caret to end of inserted text
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    // Imperative actions exposed to Plasmic via ref
    React.useImperativeHandle(
        ref,
        (): ContentEditableTextareaRef => ({
            clearText() {
                const el = innerRef.current;
                if (!el) return;
                if (isControlled) {
                    // Controlled: ask parent to set value to empty
                    onChange?.("");
                } else {
                    // Uncontrolled: mutate DOM and notify
                    el.textContent = "";
                    emitChange();
                }
            },
            setText(text: string) {
                const el = innerRef.current;
                if (!el) return;
                if (isControlled) {
                    onChange?.(text);
                } else {
                    el.textContent = text ?? "";
                    emitChange();
                }
            },
            focus() {
                innerRef.current?.focus();
            },
            blur() {
                innerRef.current?.blur();
            },
        }),
        [isControlled, onChange, emitChange]
    );

    // Placeholder behavior via data attr + CSS
    const dataPlaceholder = placeholder ?? "";

    return (
        <>
            {/* Root editable div: Plasmic styles apply here */}
            <div
                ref={innerRef}
                className={className}
                style={{
                    // Good defaults for textarea-like behavior.
                    // You can override these in Plasmic if you want.
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    outline: "none",
                    cursor: disabled ? "not-allowed" : "text",
                    userSelect: disabled ? "none" : "text",
                    ...style,
                }}
                contentEditable={!disabled}
                role="textbox"
                aria-multiline={true}
                aria-disabled={disabled || undefined}
                tabIndex={disabled ? -1 : 0}
                data-placeholder={dataPlaceholder}
                onInput={handleInput}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                onFocus={onFocus}
                onBlur={onBlur}
                suppressContentEditableWarning
            />

            {/* Optional hidden input for HTML form submissions */}
            {name ? (
                <input
                    type="hidden"
                    name={name}
                    value={(isControlled ? value : innerRef.current?.textContent) ?? ""}
                    readOnly
                />
            ) : null}

            {/* Minimal placeholder styling.
          NOTE: You can override this selector globally if you want. */}
            <style>{`
        /* Show placeholder when empty */
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          opacity: 0.45;
          pointer-events: none;
        }
      `}</style>
        </>
    );
});
