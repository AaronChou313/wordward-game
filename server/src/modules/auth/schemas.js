const credentialsBody = {
  type: 'object',
  additionalProperties: false,
  required: ['username', 'password'],
  properties: {
    username: { type: 'string', minLength: 3, maxLength: 64 },
    password: { type: 'string', minLength: 10, maxLength: 128 },
  },
};

export const registerSchema = { body: credentialsBody };
export const loginSchema = { body: credentialsBody };
