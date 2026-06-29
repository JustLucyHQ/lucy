import { render, screen } from '@testing-library/react';
import { AccountNav } from '@/components/account/AccountNav';

jest.mock('next/navigation', () => ({
  usePathname: () => '/account/security',
}));

describe('AccountNav', () => {
  it('renders Profile, Security and Billing links', () => {
    render(<AccountNav />);
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('href', '/account/profile');
    expect(screen.getByRole('link', { name: /security/i })).toHaveAttribute('href', '/account/security');
    expect(screen.getByRole('link', { name: /billing/i })).toHaveAttribute('href', '/account/billing');
  });

  it('marks the current section as active', () => {
    render(<AccountNav />);
    expect(screen.getByRole('link', { name: /security/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /profile/i })).not.toHaveAttribute('aria-current');
  });
});
