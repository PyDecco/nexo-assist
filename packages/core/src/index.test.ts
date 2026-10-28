import { describe, expect, it } from 'vitest';
import { TICKET_CATEGORIES } from './index';

describe('categorias do Anexo A', () => {
  it('tem as seis categorias', () => {
    expect(TICKET_CATEGORIES).toHaveLength(6);
  });
});
