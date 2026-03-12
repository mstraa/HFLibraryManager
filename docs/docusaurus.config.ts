import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'HF Library Manager',
  tagline: 'Organize your 3D printing projects, files, and filament libraries',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://mstraa.github.io',
  baseUrl: '/HFLibraryManager/',

  organizationName: 'mstraa',
  projectName: 'HFLibraryManager',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/mstraa/HFLibraryManager/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'HF Library Manager',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/mstraa/HFLibraryManager',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {label: 'Getting Started', to: '/docs/getting-started'},
            {label: 'Features', to: '/docs/features/projects'},
            {label: 'Architecture', to: '/docs/architecture'},
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/mstraa/HFLibraryManager',
            },
            {
              label: 'Releases',
              href: 'https://github.com/mstraa/HFLibraryManager/releases',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Mstraa. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['rust', 'toml', 'bash'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
