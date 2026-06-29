/**
 * Tests for components/ui/Button.tsx
 *
 * Covers: renders children, variant class presence, loading spinner,
 * disabled state, and click behaviour.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';

// Lucide-react icons are real components — render fine in jsdom
// No mocking needed.

describe('Button', () => {
  describe('rendering children', () => {
    it('renders its children as text', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('renders a button element by default', () => {
      render(<Button>Submit</Button>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('applies primary variant classes by default', () => {
      render(<Button variant="primary">Primary</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('bg-accent');
    });

    it('applies secondary variant classes', () => {
      render(<Button variant="secondary">Secondary</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('bg-transparent');
      expect(btn.className).toContain('border-edge-strong');
    });

    it('applies ghost variant classes', () => {
      render(<Button variant="ghost">Ghost</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('border-transparent');
    });

    it('applies danger variant classes', () => {
      render(<Button variant="danger">Delete</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('bg-red-600');
    });
  });

  describe('loading state', () => {
    it('renders a spinner (svg) when loading is true', () => {
      render(<Button loading>Saving...</Button>);
      // Loader2 renders an <svg> inside the button
      const btn = screen.getByRole('button');
      expect(btn.querySelector('svg')).toBeTruthy();
    });

    it('disables the button when loading is true', () => {
      render(<Button loading>Saving...</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('still renders children text alongside the spinner', () => {
      render(<Button loading>Saving...</Button>);
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
  });

  describe('disabled state', () => {
    it('is disabled when the disabled prop is passed', () => {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('applies opacity class when disabled', () => {
      render(<Button disabled>Disabled</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('disabled:opacity-50');
    });

    it('does not fire onClick when disabled', () => {
      const handleClick = jest.fn();
      render(
        <Button disabled onClick={handleClick}>
          Cannot click
        </Button>
      );
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('click behaviour', () => {
    it('fires onClick when enabled', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Click me</Button>);
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('icon prop', () => {
    it('renders the icon when not loading', () => {
      render(
        <Button icon={<span data-testid="icon">X</span>}>With Icon</Button>
      );
      expect(screen.getByTestId('icon')).toBeInTheDocument();
    });

    it('does not render the icon when loading (spinner takes its place)', () => {
      render(
        <Button loading icon={<span data-testid="icon">X</span>}>
          Loading
        </Button>
      );
      expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    });
  });
});
