<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep company posting defaults and report account references in `src/lib/accounting-rules.ts`; reports derive tax figures from stored invoices, not account names or balances, because invoice data retains tax rates and partner details.
- Keep VAT calendar boundaries and period navigation in `src/lib/vat-period.ts`; update each period atomically and use the same bounds for queries and exports to prevent partial-quarter or stale exports.
