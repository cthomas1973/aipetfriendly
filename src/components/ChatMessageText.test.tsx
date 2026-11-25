// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatMessageText } from './ChatMessageText';

afterEach(cleanup);

describe('ChatMessageText', () => {
  it('renderiza listas, títulos y negritas del modelo', () => {
    const { container } = render(
      <ChatMessageText content={'Intro\n### Pasos\n1. **Preparación**: termómetro\n2. **Toma**: con calma\n- Agua fresca'} />,
    );
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
    expect(container.querySelectorAll('ul > li')).toHaveLength(1);
    expect(container.querySelector('li strong')?.textContent).toBe('Preparación');
    expect(container.textContent).not.toContain('**');
    expect(container.textContent).not.toContain('###');
  });

  it('no interpreta HTML del contenido', () => {
    const { container } = render(<ChatMessageText content={'<img src=x onerror=alert(1)>'} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
