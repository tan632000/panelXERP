import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '@kernel/core/audit/audit.module';
import { AuthPrincipalCache } from '@kernel/core/auth/auth-principal-cache.service';
import { AuthController } from '@kernel/core/auth/auth.controller';
import { AuthService } from '@kernel/core/auth/auth.service';
import { PasswordResetToken } from '@kernel/core/auth/entities/password-reset-token.entity';
import { UserSession } from '@kernel/core/auth/entities/user-session.entity';
import { JwtAuthGuard } from '@kernel/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@kernel/core/auth/guards/roles.guard';
import { SignatureReviewService } from '@kernel/core/auth/signature-review.service';
import { JwtStrategy } from '@kernel/core/auth/strategies/jwt.strategy';
import { UserRole } from '@kernel/core/users/entities/user-role.entity';
import { User } from '@kernel/core/users/entities/user.entity';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([User, UserRole, PasswordResetToken, UserSession]),
    AuditModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('app.jwtSecret');
        if (!secret) throw new Error('Missing JWT secret config');
        return { secret, signOptions: { expiresIn: '8h' as const } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthPrincipalCache,
    AuthService,
    SignatureReviewService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthPrincipalCache,
    AuthService,
    SignatureReviewService,
    JwtModule,
    PassportModule,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
