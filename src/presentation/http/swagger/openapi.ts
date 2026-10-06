import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import './paths/auth.paths';
import './paths/user.paths';
import './paths/system.paths';
import { registry } from './registry';

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: { title: 'Node-JS-Clean-Arc-Template API', version: '1.0.0', description: 'Auth backend template. All /api/v1 routes require X-Platform and X-Language headers.' },
    servers: [{ url: '/' }],
    tags: [{ name: 'Auth' }, { name: 'Users' }, { name: 'System' }],
  });
}
