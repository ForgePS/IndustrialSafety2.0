import type { Config } from 'tailwindcss'

const config: Omit<Config, 'content'> = {
  plugins: [require('tailwindcss-logical'), require('tailwindcss-animate')],
  theme: {
    borderColor: ({ theme }: { theme: (key: string) => Record<string, string> }) => ({
      ...theme('colors'),
      DEFAULT: 'hsl(var(--border) / 0.1)'
    }),
    borderRadius: {
      none: '0px',
      sm: 'calc(var(--radius) - 4px)',
      DEFAULT: 'calc(var(--radius) - 2px)',
      md: 'var(--radius)',
      lg: 'calc(var(--radius) + 2px)',
      xl: 'calc(var(--radius) + 6px)',
      '2xl': 'calc(var(--radius) + 10px)',
      '3xl': 'calc(var(--radius) + 18px)',
      full: '9999px'
    },
    container: {
      padding: '1.5rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'border-beam': 'border-beam 14s infinite linear',
        rainbow: 'rainbow 2s infinite linear',
        meteor: 'meteor 5s linear infinite',
        'shimmer-slide': 'shimmer-slide 3s ease-in-out infinite alternate',
        'spin-around': 'spin-around 6s infinite linear'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'border-beam': {
          '100%': {
            'offset-distance': '100%'
          }
        },
        rainbow: {
          '0%': {
            'background-position': '0%'
          },
          '100%': {
            'background-position': '200%'
          }
        },
        meteor: {
          '0%': { transform: 'rotate(215deg) translateX(0)', opacity: '1' },
          '70%': { opacity: '1' },
          '100%': {
            transform: 'rotate(215deg) translateX(-500px)',
            opacity: '0'
          }
        },
        'shimmer-slide': {
          to: {
            transform: 'translate(calc(100cqw - 100%), 0)'
          }
        },
        'spin-around': {
          '0%': {
            transform: 'translateZ(0) rotate(0)'
          },
          '15%, 35%': {
            transform: 'translateZ(0) rotate(90deg)'
          },
          '65%, 85%': {
            transform: 'translateZ(0) rotate(270deg)'
          },
          '100%': {
            transform: 'translateZ(0) rotate(360deg)'
          }
        }
      },
      fontSize: {
        base: ['1rem', { lineHeight: '1.375rem' }],
        lg: ['1.125rem', { lineHeight: '1.5rem' }],
        xl: ['1.25rem', { lineHeight: '1.625rem' }]
      },
      boxShadow: {
        sm: '0 1px 2px 0 hsl(var(--shadow-color) / 0.22)',
        DEFAULT: '0 2px 4px 0 hsl(var(--shadow-color) / 0.26)',
        md: '0 4px 6px -1px hsl(var(--shadow-color) / 0.2)',
        lg: '0 10px 15px -2px hsl(var(--shadow-color) / 0.34)',
        xl: '0 20px 25px -6px hsl(var(--shadow-color) / 0.38)',
        '2xl': '0 16px 30px -6px hsl(var(--shadow-color) / 0.42)',
        inner: 'inset 0 2px 4px 0 hsl(var(--shadow-color) / 0.26)',
        none: 'none',
        primarySm: '0 1px 2px 0 hsl(var(--primary) / 0.22)',
        primaryDefault: '0 2px 4px 0 hsl(var(--primary) / 0.26)',
        primaryMd: '0 4px 6px -1px hsl(var(--primary) / 0.3)',
        primaryLg: '0 10px 15px -2px hsl(var(--primary) / 0.34)',
        secondaryDefault: '0 2px 4px 0 hsl(var(--secondary) / 0.26)',
        secondaryMd: '0 4px 6px -1px hsl(var(--secondary) / 0.3)',
        destructiveDefault: '0 2px 4px 0 hsl(var(--destructive) / 0.26)',
        destructiveMd: '0 4px 6px -1px hsl(var(--destructive) / 0.3)'
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        border: 'hsl(var(--border) / 0.1)',
        input: 'hsl(var(--input) /  0.4)',
        ring: 'hsl(var(--ring))',
        textPrimary: 'hsl(var(--foreground) / 0.9)',
        textSecondary: 'hsl(var(--foreground) / 0.8)',
        textDisabled: 'hsl(var(--foreground) / 0.5)',
        neutral: 'hsl(var(--neutral))',
        'base-200': 'hsl(var(--base-200))',
        'base-300': 'hsl(var(--base-300))',
        backdrop: 'hsl(var(--backdrop) / 0.6)',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          focus: 'hsl(var(--primary-focus))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / 0.1)',
          foreground: 'hsl(var(--accent-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / 0.2)',
          foreground: 'hsl(var(--muted-foreground) / 0.9)'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground) / 0.8)'
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))'
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))'
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground)/0.9)',
          accent: 'hsl(var(--sidebar-accent)/0.1)',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border)/0.1)',
          ring: 'hsl(var(--sidebar-ring))'
        }
      }
    }
  }
}

export default config
