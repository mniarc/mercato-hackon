// Injected into the sandboxed document so annotated fragments are visible.
export const HIGHLIGHT_STYLE = 'mark[data-comment-id]{background:#fde68a;color:inherit;border-radius:2px;padding:0 1px;cursor:pointer}mark[data-comment-id].is-active{background:#f59e0b;color:#111827}'

// A srcdoc document does not inherit the portal's reset or typography. Keep
// this aligned with the native documents preview contract while retaining the
// iframe boundary required for safe selection and annotations.
export const DOCUMENT_PREVIEW_STYLE = [
  ':root{color-scheme:light;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0a0a0a;background:#fff}',
  '*{box-sizing:border-box}',
  'body{margin:0;padding:1rem;font-family:inherit;font-size:1rem;line-height:1.75;overflow-wrap:anywhere}',
  'body>:first-child{margin-top:0}body>:last-child{margin-bottom:0}',
  'h1,h2,h3{line-height:1.25}',
  'h1{margin:2rem 0 1rem;font-size:1.875rem;font-weight:700}',
  'h2{margin:1.75rem 0 .75rem;font-size:1.5rem;font-weight:600}',
  'h3{margin:1.5rem 0 .5rem;font-size:1.25rem;font-weight:600}',
  'p,ul,ol{margin:1rem 0}ul,ol{padding-left:1.5rem}li{margin:.25rem 0}',
  'blockquote{margin:1.5rem 0;border-left:4px solid #e4e4e7;padding-left:1rem;font-style:italic}',
  'pre{margin:1.5rem 0;overflow-x:auto;border-radius:.375rem;background:#f4f4f5;padding:1rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.875rem}',
  'a{color:#4f46e5;text-decoration:underline;text-underline-offset:.25rem}',
  'img{max-width:100%;height:auto;margin:1.5rem 0;border-radius:.375rem}',
  'table{width:100%;margin:1.5rem 0;border-collapse:collapse}',
  'th,td{border:1px solid #e4e4e7;padding:.5rem .75rem;text-align:left;vertical-align:top}th{background:#f4f4f5}',
].join('')
