import path from 'path';

export default ({ env }) => ({
  connection: {
    client: 'sqlite',
    connection: {
      // This forces it to look in your project root -> .tmp -> data.db
      filename: path.join(process.cwd(), '.tmp', 'data.db'),
    },
    useNullAsDefault: true,
  },
});