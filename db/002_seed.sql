-- Roles & permissions (RBAC). Enforced in the API, never by hiding menu items.
INSERT INTO roles (code, description) VALUES
 ('customer','Customer'),('professional','Professional'),('business_member','Business team member'),('org_member','Enterprise member'),
 ('super_admin','Everything'),('platform_admin','General platform management'),('operations_manager','Bookings & operations'),
 ('verification_officer','Identity & credential verification'),('finance_officer','Transactions, settlements, refunds'),
 ('support_agent','Customer issues'),('dispute_officer','Dispute resolution'),('content_manager','Website & categories'),
 ('marketing_manager','Campaigns & promotions'),('analyst','Read-only analytics')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (code) VALUES
 ('analytics.read'),('customers.read'),('customers.suspend'),('professionals.read'),('professionals.suspend'),
 ('verification.review'),('categories.write'),('bookings.read'),('bookings.modify'),('quotations.read'),('projects.read'),
 ('transactions.read'),('settlements.read'),('settlements.approve'),('refunds.approve.small'),('refunds.approve.large'),
 ('payout_account.change'),('disputes.resolve'),('reviews.moderate'),('support.reply'),('locations.write'),
 ('promotions.write'),('subscriptions.write'),('activation_fees.write'),('commission.write'),('content.write'),
 ('reports.export'),('audit.read'),('roles.write'),('settings.write'),('data.export')
ON CONFLICT DO NOTHING;

-- role -> permission map
WITH m(role, perm) AS (VALUES
 ('super_admin','*'),
 ('platform_admin','analytics.read'),('platform_admin','customers.read'),('platform_admin','professionals.read'),('platform_admin','bookings.read'),('platform_admin','locations.write'),('platform_admin','categories.write'),('platform_admin','settings.write'),
 ('operations_manager','bookings.read'),('operations_manager','bookings.modify'),('operations_manager','quotations.read'),('operations_manager','projects.read'),('operations_manager','professionals.read'),('operations_manager','customers.read'),
 ('verification_officer','verification.review'),('verification_officer','professionals.read'),
 ('finance_officer','transactions.read'),('finance_officer','settlements.read'),('finance_officer','settlements.approve'),('finance_officer','refunds.approve.small'),('finance_officer','refunds.approve.large'),('finance_officer','payout_account.change'),('finance_officer','reports.export'),
 ('support_agent','customers.read'),('support_agent','bookings.read'),('support_agent','support.reply'),('support_agent','refunds.approve.small'),
 ('dispute_officer','disputes.resolve'),('dispute_officer','bookings.read'),('dispute_officer','reviews.moderate'),
 ('content_manager','content.write'),('content_manager','categories.write'),
 ('marketing_manager','promotions.write'),('marketing_manager','analytics.read'),
 ('analyst','analytics.read'))
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM m JOIN roles r ON r.code = m.role JOIN permissions p ON p.code = m.perm
ON CONFLICT DO NOTHING;
INSERT INTO permissions (code, description) VALUES ('*','All permissions') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions SELECT r.id, p.id FROM roles r, permissions p WHERE r.code='super_admin' AND p.code='*' ON CONFLICT DO NOTHING;

-- Categories (risk_level 3 = licensed / safety-critical)
INSERT INTO categories (slug, name, icon, requires_license, license_body, risk_level, emergency_capable, sort_order) VALUES
 ('plumbing','Plumbing','wrench',false,NULL,2,true,1),
 ('electrical','Electrical','zap',true,'ERC / EPRA',3,true,2),
 ('painting','Painting & decoration','paint-roller',false,NULL,1,false,3),
 ('carpentry','Carpentry & furniture','hammer',false,NULL,1,false,4),
 ('appliance-repair','Appliance & technical repair','settings',false,NULL,2,false,5),
 ('ac-refrigeration','AC & refrigeration','snowflake',false,NULL,2,false,6),
 ('cleaning','Cleaning','sparkles',false,NULL,1,false,7),
 ('automotive','Mechanics & automotive','car',false,NULL,2,true,8),
 ('moving','Movers & relocation','truck',false,NULL,1,false,9),
 ('gardening','Gardening & landscaping','leaf',false,NULL,1,false,10),
 ('pest-control','Pest control','bug',true,'PCPB',3,false,11),
 ('welding','Welding & fabrication','flame',false,NULL,2,false,12),
 ('masonry','Masonry & construction','brick-wall',false,NULL,3,false,13),
 ('roofing','Roofing & waterproofing','home',false,NULL,3,false,14),
 ('security-cctv','CCTV & security systems','camera',false,NULL,2,false,15),
 ('solar','Solar installation','sun',true,'EPRA',3,false,16),
 ('it-support','IT support & computers','laptop',false,NULL,1,false,17),
 ('photo-video','Photography & videography','aperture',false,NULL,1,false,18),
 ('tutoring','Tutors & instructors','book-open',false,NULL,2,false,19),
 ('beauty','Beauty & personal care','scissors',false,NULL,1,false,20),
 ('events','Event planning & decor','party-popper',false,NULL,1,false,21),
 ('consulting','Professional consultants','briefcase',false,NULL,1,false,22),
 ('legal','Legal services','scale',true,'LSK',3,false,23),
 ('accounting','Accounting & tax','calculator',true,'ICPAK',3,false,24),
 ('locksmith','Locksmith','key',false,NULL,2,true,25)
ON CONFLICT DO NOTHING;

-- Services with problem-keywords powering "leaking pipe under sink" style search
INSERT INTO services (category_id, slug, name, keywords)
SELECT c.id, s.slug, s.name, s.kw FROM categories c JOIN (VALUES
 ('plumbing','pipe-repair','Pipe repair & leaks','{leak,leaking,burst,pipe,sink,drip}'::text[]),
 ('plumbing','tap-installation','Tap & fixture installation','{tap,faucet,mixer,shower}'),
 ('plumbing','drain-unblocking','Drain unblocking','{blocked,drain,toilet,sewer}'),
 ('plumbing','water-tank','Water tank installation','{tank,water,storage,pump}'),
 ('electrical','socket-repair','Socket & switch repair','{socket,switch,faulty,outlet,sparking}'),
 ('electrical','house-wiring','House wiring & installation','{wiring,rewire,installation,db,board}'),
 ('electrical','electrical-inspection','Electrical inspection','{inspection,safety,certificate}'),
 ('painting','interior-painting','Interior painting','{paint,walls,interior,bedroom,house}'),
 ('painting','exterior-painting','Exterior painting & waterproof coat','{exterior,outside,fence,gate}'),
 ('carpentry','furniture-repair','Furniture repair','{furniture,chair,table,wardrobe,repair}'),
 ('carpentry','custom-furniture','Custom furniture','{custom,bed,cabinet,kitchen}'),
 ('appliance-repair','washing-machine','Washing machine repair','{washing,machine,laundry,spin}'),
 ('appliance-repair','fridge-repair','Fridge & freezer repair','{fridge,freezer,cooling}'),
 ('ac-refrigeration','ac-service','AC servicing & repair','{ac,air,conditioner,cooling,gas}'),
 ('cleaning','deep-cleaning','Deep cleaning','{deep,clean,house,apartment}'),
 ('cleaning','post-construction-cleaning','Post-construction cleaning','{construction,renovation,dust}'),
 ('security-cctv','cctv-install','CCTV installation','{cctv,camera,security,alarm}'),
 ('solar','solar-install','Solar panel installation','{solar,panel,inverter,battery}'),
 ('it-support','computer-repair','Computer & laptop repair','{laptop,computer,virus,slow,screen}'),
 ('moving','house-moving','House moving','{moving,relocation,truck,pack}'),
 ('locksmith','lockout','Lockout & lock replacement','{lock,key,locked,broken}')
) AS s(cat, slug, name, kw) ON c.slug = s.cat
ON CONFLICT DO NOTHING;

INSERT INTO platform_settings (key, value, country_code) VALUES
 ('commission.default_bps','500','KE'),
 ('currency','"KES"','KE'),
 ('booking.response_window_minutes','{"standard":120,"urgent":10,"quotation":2880}','KE'),
 ('booking.completion_auto_confirm_hours','48','KE'),
 ('dispute.resolution_deadline_hours','72','KE'),
 ('milestone.auto_approve_hours','72','KE'),
 ('refund.large_threshold_minor','500000','KE'),
 ('ranking.weights','{"L":0.25,"Q":0.20,"A":0.15,"R":0.15,"P":0.10,"C":0.15}',NULL),
 ('tracking.retention_hours','24',NULL)
ON CONFLICT DO NOTHING;

INSERT INTO commission_rules (commission_bps, priority) VALUES (500, 0);
INSERT INTO activation_fee_rules (country_code, amount, enabled, founding_waiver) VALUES ('KE', 50000, false, true); -- KSh 500, OFF at launch
INSERT INTO subscription_plans (code, name, monthly_amount, features) VALUES
 ('free','Free',0,'{"team":false}'),
 ('professional_plus','Professional Plus',0,'{"crm":true,"export":true}'),
 ('business_pro','Business Pro',0,'{"team":true,"multi_technician":true}')
ON CONFLICT DO NOTHING;
