import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /** Process-level liveness probe: it must not fail because a dependency is down. */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  private readiness(): { status: 'ok'; database: 'connected' } {
    if (this.connection.readyState !== 1) {
      throw new ServiceUnavailableException('Database is not ready');
    }
    return { status: 'ok', database: 'connected' };
  }

  /** Dependency readiness probe for load balancers and uptime monitors. */
  @Get()
  status(): { status: 'ok'; database: 'connected' } {
    return this.readiness();
  }

  @Get('ready')
  ready(): { status: 'ok'; database: 'connected' } {
    return this.readiness();
  }
}
