import React from 'react';
import { render, screen } from '@testing-library/react';
import { SafeLink } from '@/components/chat/SafeLink';

describe('SafeLink', () => {
  it('renders https links as new-tab anchors with noopener noreferrer nofollow', () => {
    render(<SafeLink href="https://example.com/x">site</SafeLink>);
    const a = screen.getByRole('link', { name: 'site' });
    expect(a).toHaveAttribute('href', 'https://example.com/x');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });

  it('renders mailto links as anchors', () => {
    render(<SafeLink href="mailto:a@example.com">mail</SafeLink>);
    expect(screen.getByRole('link', { name: 'mail' })).toHaveAttribute('href', 'mailto:a@example.com');
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', '/relative', undefined])(
    'renders %s as plain text, not a link',
    (href) => {
      render(<SafeLink href={href as string | undefined}>label</SafeLink>);
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByText('label')).toBeInTheDocument();
    }
  );
});
