import * as assert from 'assert';
import { renderMarkdownWithDiagrams } from '../../panels/diagrams';

suite('renderMarkdownWithDiagrams', () => {
  test('mermaid fences become pre.mermaid blocks and set hasMermaid', () => {
    const { html, hasMermaid } = renderMarkdownWithDiagrams(
      '# T\n\n```mermaid\ngraph TD; A-->B;\n```\n',
      {},
    );
    assert.ok(hasMermaid);
    assert.ok(html.includes('<pre class="mermaid">graph TD; A--&gt;B;</pre>'));
  });

  test('plantuml fences render as images against the configured server', () => {
    const { html, hasMermaid } = renderMarkdownWithDiagrams(
      '```plantuml\nA -> B: hi\n```\n',
      { plantUmlServer: 'https://uml.example.com/plantuml/' },
    );
    assert.ok(!hasMermaid);
    assert.ok(/<img class="plantuml" src="https:\/\/uml\.example\.com\/plantuml\/svg\/[A-Za-z0-9\-_]+"/.test(html));
  });

  test('puml alias works; no server -> plain code block', () => {
    const withServer = renderMarkdownWithDiagrams('```puml\nA -> B\n```\n', {
      plantUmlServer: 'https://x.test',
    });
    assert.ok(withServer.html.includes('img class="plantuml"'));
    const without = renderMarkdownWithDiagrams('```plantuml\nA -> B\n```\n', {});
    assert.ok(without.html.includes('<pre><code'));
    assert.ok(!without.html.includes('plantuml" src'));
  });

  test('ordinary code fences are untouched', () => {
    const { html, hasMermaid } = renderMarkdownWithDiagrams('```ts\nconst a = 1;\n```\n', {});
    assert.ok(!hasMermaid);
    assert.ok(html.includes('<pre><code'));
  });
});

