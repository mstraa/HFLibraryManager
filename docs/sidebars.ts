import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'Features',
      collapsed: false,
      items: [
        'features/projects',
        'features/files',
        'features/filaments',
        'features/search-filtering',
        'features/tags-collections',
        'features/views',
        'features/libraries',
        'features/keyboard-shortcuts',
      ],
    },
    'architecture',
    'development',
  ],
};

export default sidebars;
