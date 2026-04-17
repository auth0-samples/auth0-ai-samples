import Fastify, { FastifyRequest } from 'fastify';
import fastifyAuth0 from '@auth0/auth0-fastify-api';
import 'dotenv/config';

const fastify = Fastify({
  logger: true,
});

fastify.register(fastifyAuth0, {
  domain: process.env.AUTH0_DOMAIN as string,
  audience: process.env.API_AUTH0_AUDIENCE as string,
});

fastify.register(() => {
  fastify.get(
    '/api/private-scope',
    {
      preHandler: fastify.requireAuth({ scopes: ['read:private'] }),
    },
    async (request: FastifyRequest, reply) => {
      return {'msg': "Hello from upstream API", 'sub': request.user.sub, 'scopes': request.user.scope};
    }
  );
});

const start = async () => {
  try {
    await fastify.listen({ port: 8787 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();