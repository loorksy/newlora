module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@newlora|lucide-react-native|react-native-svg)/)',
  ],
  moduleNameMapper: {
    '^@newlora/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
  },
};
