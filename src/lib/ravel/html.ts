export function wrapGameHtml(code: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
  canvas { border: 1px solid #333; }
</style>
</head>
<body>
<canvas id="gameCanvas" width="800" height="600"></canvas>
<script>
${code}
</script>
</body>
</html>`;
}