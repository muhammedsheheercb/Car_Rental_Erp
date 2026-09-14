"use client";

import { useRef, useTransition } from "react";
import { useToast } from "./toast";

type Result = { ok: boolean; message: string };
type Action = (formData: FormData) => Result | Promise<Result>;

export function TrimmedForm({
  action,
  className,
  children,
}: {
  action: Action;
  className?: string;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const { complete, loading } = useToast();
  function validate(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    form.querySelectorAll<HTMLElement>("[data-validation-message]").forEach((node) => {
      node.remove();
    });
    let firstInvalid: HTMLInputElement | HTMLTextAreaElement | null = null;
    for (const field of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input[required], textarea[required]",
    )) {
      if (field.type === "password" || field.type === "checkbox") continue;
      field.value = field.value.trim();
      if (field.value) {
        field.removeAttribute("aria-invalid");
        continue;
      }
      event.preventDefault();
      field.setAttribute("aria-invalid", "true");
      const message = document.createElement("p");
      message.dataset.validationMessage = "true";
      message.className = "mt-1 text-sm text-red-300";
      message.textContent = "This field is required.";
      field.parentElement?.append(message);
      firstInvalid ??= field;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    event.preventDefault();
    startTransition(async () => {
      const key = `form:${form.action || "mutation"}`;
      loading("Saving…", key);
      try {
        const result = await action(new FormData(form));
        complete(key, result.message, result.ok ? "success" : "error");
        if (result.ok) form.reset();
      } catch {
        complete(key, "We could not save your changes. Please try again.", "error");
      }
    });
  }
  return (
    <form ref={formRef} onSubmit={validate} noValidate className={className} aria-busy={pending}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
