# FX Component Spec Template

Every shared component document must include:

| Section                 | Required content                                               |
| ----------------------- | -------------------------------------------------------------- |
| Purpose                 | Why the component exists                                       |
| Properties              | Public props / slots / tokens used                             |
| Variants                | Allowed visual/behavioral variants                             |
| States                  | Default, hover, focus, active, disabled, loading, error, empty |
| Permissions             | What is hidden/disabled when unauthorized (presentation only)  |
| Accessibility           | Roles, names, contrast                                         |
| Keyboard support        | Keys and focus behavior                                        |
| Screen reader support   | Announcements and structure                                    |
| Responsive behavior     | Phone → operations display                                     |
| Examples                | Do examples                                                    |
| Anti-patterns           | Don't examples                                                 |
| Future extension points | Safe product hooks                                             |

Components inherit all values from design tokens. No hard-coded colors, spacing, or type.
