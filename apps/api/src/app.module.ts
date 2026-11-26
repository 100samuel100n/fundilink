import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccessGuard, Audit, AuthGuard, Db } from './common/core.ts';
import { Ai, Email, Maps, Payments, Push, Sms, Storage } from './providers/providers.ts';
import { AuthController, AuthService } from './modules/auth.ts';
import { DiscoveryController, DiscoveryService } from './modules/discovery.ts';
import { BookingController, BookingService } from './modules/bookings.ts';
import { PaymentController, PaymentService } from './modules/payments.ts';
import { WalletService } from './modules/wallet.ts';
import { Notifier } from './modules/notifier.ts';
import { TrackingController, TrackingGateway } from './modules/tracking.ts';
import { ProfessionalController, ProfessionalService } from './modules/professionals.ts';
import { ProjectController, ProjectService } from './modules/projects.ts';
import { AccountController, ChatGateway, MessagingController, MessagingService, ReviewController } from './modules/community.ts';
import { AdminController } from './modules/admin.ts';
import { EnterpriseController, EnterpriseService } from './modules/enterprise.ts';
import { AiController, AiService } from './modules/ai.ts';
import { JobsService } from './modules/jobs.ts';
import { HealthController } from './modules/health.ts';
import { AdminManageController } from './modules/adminManage.ts';
import { EquipmentController, MonetisationController, NotifyService, PublicContentController, SupportController, TeamController, TrustExtrasController } from './modules/extensions.ts';
import { EnterpriseExtrasController, InvoiceController, VerificationSelfController } from './modules/extensions2.ts';
import { DemoController } from './modules/demo.ts';
import { MaskedCalls, OpenSearchIndex, WhatsApp } from './providers/extras.ts';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [
    HealthController, AuthController, DiscoveryController, BookingController, PaymentController, TrackingController, ProfessionalController,
    ProjectController, MessagingController, ReviewController, AccountController, AdminController, EnterpriseController, AiController,
    AdminManageController, PublicContentController, SupportController, MonetisationController, TrustExtrasController, TeamController, EquipmentController,
    VerificationSelfController, InvoiceController, EnterpriseExtrasController, DemoController,
  ],
  providers: [
    Db, Audit, WalletService, Notifier, Sms, Email, Push, Storage, Payments, Maps, Ai,
    AuthService, DiscoveryService, BookingService, PaymentService, TrackingGateway, ProfessionalService, ProjectService,
    MessagingService, ChatGateway, EnterpriseService, AiService, JobsService,
    NotifyService, WhatsApp, MaskedCalls, OpenSearchIndex,
    { provide: APP_GUARD, useClass: AuthGuard },   // everything requires a valid token unless @Public()
    { provide: APP_GUARD, useClass: AccessGuard }, // then role/permission checks run server-side
  ],
  exports: [Db],
})
export class AppModule {}
