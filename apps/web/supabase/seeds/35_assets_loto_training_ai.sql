-- =============================================================================
-- Demo plant: Cypress Bend Rice Mill — Assets & Equipment, LOTO, QR codes, base Training
-- (courses / assignments / completions) and Forge AI (knowledge, watch, usage, analytics).
-- Local development and sales-demo data only. Loaded after seed.sql and 10_cypress_bend_plant.sql.
--
-- Id namespace 65000000-0000-4000-8000-xxxxxxxxxxxx:
--   assets 0000000010NN, asset assignments 0000000011NN, maintenance 0000000012NN, meter readings 00000013xxxx
--   LOTO procedures 0000000020NN, energy sources 0000000021NN, steps 00000022xxxx, reviews 0000000023NN,
--   field-use records 0000000024NN, revision snapshots 0000000025NN
--   QR codes 0000000030NN
--   training courses 0000000040NN, assignments 0000000041NN, completions 0000000042NN
--   AI knowledge sources 0000000050NN, conversations 0000000060NN, saved reports 0000000070NN
--
-- Kept from seed.sql (tests depend on them): asset id ...001001 with asset_number DEMO-AST-000001.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Assets & Equipment
-- -----------------------------------------------------------------------------

-- The seeded forklift keeps its id and DEMO-AST-000001 number; give it a real identity.
update public.forge_assets
set asset_type = 'vehicle_equipment',
    name = 'Forklift FL-07 (5,000 lb LPG)',
    description = 'LPG cushion-tire forklift assigned to Shipping & Receiving for bagged rice, totes and pallet handling on the dock and in Warehouse A. Pre-shift checklist required every shift; LPG cylinders are changed only at the cylinder cage.',
    status = 'active',
    condition = 'good',
    criticality = 'critical',
    manufacturer = 'Delta Lift Trucks',
    model = 'DLT-G50',
    serial_number = 'DLT-G50-10442',
    barcode = 'CB-FL-07',
    custodian_personnel_id = '60000000-0000-4000-8000-000000003018',
    custodian_user_id = null,
    purchase_date = date '2024-10-21',
    in_service_date = date '2024-11-04',
    warranty_expires_on = current_date + 10,
    created_at = now() - interval '88 days 6 hours',
    updated_at = now() - interval '9 days 2 hours'
where id = '20000000-0000-4000-8000-000000001001';

insert into public.forge_assets (
  id, organization_id, asset_number, asset_type, name, description, status, condition, criticality,
  manufacturer, model, serial_number, barcode, location_id, division_id, custodian_personnel_id, custodian_user_id,
  purchase_date, in_service_date, warranty_expires_on, purchase_cost, replacement_cost,
  created_by, updated_by, created_at, updated_at
)
select
  v.id::uuid, '20000000-0000-4000-8000-000000000100', v.asset_number, v.asset_type, v.name, v.description,
  v.status, v.condition, v.criticality, v.manufacturer, v.model, v.serial_number, v.barcode,
  '20000000-0000-4000-8000-000000000300', '20000000-0000-4000-8000-000000000200', v.custodian::uuid, null,
  v.purchase_date::date, v.in_service_date::date, v.warranty::date, v.purchase_cost, v.replacement_cost,
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  now() - v.created_ago::interval, now() - v.updated_ago::interval
from (values
  ('65000000-0000-4000-8000-000000001002','AST-000002','facility_system','Bucket Elevator BE-1 (Receiving Leg)',
   'Receiving leg lifting rough rice from the truck dump pit (DC-1) to the distributor head at 140 ft. 3,000 bu/hr, 14 in. buckets on a 16 in. belt, 40 hp head drive with backstop. Head and boot bearing temperature and belt-alignment sensors are wired to the PLC.',
   'active','good','critical','Bayou Grain Systems','BGS-1614-140','BGS-14-2208','CB-BE-1',null,'2008-04-15','2008-09-01',null,186000.00,310000.00,'88 days 5 hours','18 days 3 hours'),
  ('65000000-0000-4000-8000-000000001003','AST-000003','facility_system','Bucket Elevator BE-4 (Mill Feed Leg)',
   'Mill feed leg from the tempering bins to the husker surge bin. 1,200 bu/hr, 10 in. buckets, 15 hp drive. Speed switch is interlocked with the husker feed gates.',
   'active','good','critical','Bayou Grain Systems','BGS-1012-85','BGS-14-2213','CB-BE-4',null,'2014-03-10','2014-06-02',null,92000.00,165000.00,'88 days 5 hours','33 days 4 hours'),
  ('65000000-0000-4000-8000-000000001004','AST-000004','equipment','Drag Conveyor DC-1 (Truck Dump Pit)',
   'En-masse drag conveyor under the truck dump grate feeding BE-1. 24 in. chain, 30 hp drive, zero-speed switch and plugged-chute sensor at the discharge.',
   'active','fair','important','Prairie Conveyor Co.','PC-EM24','PCC-24-77810','CB-DC-1',null,'2008-04-15','2008-09-01',null,74000.00,128000.00,'88 days 5 hours','6 days 5 hours'),
  ('65000000-0000-4000-8000-000000001005','AST-000005','equipment','Screw Conveyor SC-6 (Hull Transfer)',
   '12 in. screw conveyor carrying hulls from the husker aspirators to the hull house. 7.5 hp drive; hinged inspection covers have interlock switches.',
   'active','fair','important','Prairie Conveyor Co.','PC-SC12-40','PCC-12-90455','CB-SC-6',null,'2016-07-11','2016-08-29',null,18500.00,31000.00,'88 days 5 hours','44 days 2 hours'),
  ('65000000-0000-4000-8000-000000001006','AST-000006','equipment','Column Dryer DR-1 (LP Gas)',
   'Continuous-flow column dryer, 1,000 bu/hr at 5 points of moisture removal. 8.5 MMBtu/hr LP gas burner, two 40 hp fans and discharge metering rolls. High-limit and flame-safeguard controls are tested before every harvest.',
   'active','good','critical','Delta Dryer Works','DDW-1000C','DDW-C-31187','CB-DR-1',null,'2012-05-21','2012-08-20',null,412000.00,690000.00,'88 days 4 hours','12 days 6 hours'),
  ('65000000-0000-4000-8000-000000001007','AST-000007','equipment','Column Dryer DR-2 (LP Gas)',
   'Second 1,000 bu/hr column dryer, same model as DR-1. Down for the post-harvest burner and plenum rebuild.',
   'maintenance','fair','critical','Delta Dryer Works','DDW-1000C','DDW-C-33402','CB-DR-2',null,'2015-06-01','2015-08-24',null,455000.00,690000.00,'88 days 4 hours','4 days 3 hours'),
  ('65000000-0000-4000-8000-000000001008','AST-000008','equipment','Rubber Roll Husker HU-1',
   'Rubber roll paddy husker, 10 in. rolls, 6 t/hr. Pneumatic roll-gap control at 90 psi, 25 hp drive. Discharges to the paddy separator; hulls aspirated to SC-6.',
   'active','good','critical','Riverbend Milling Machinery','RMM-HR10','RMM-10-5521','CB-HU-1',null,'2018-02-12','2018-04-16',null,98000.00,140000.00,'88 days 3 hours','2 hours'),
  ('65000000-0000-4000-8000-000000001009','AST-000009','equipment','Rubber Roll Husker HU-2',
   'Second rubber roll husker, same model as HU-1. Running at reduced feed rate until the drive-side bearings and rolls are replaced.',
   'active','poor','critical','Riverbend Milling Machinery','RMM-HR10','RMM-10-5644','CB-HU-2',null,'2018-02-12','2018-04-16',null,98000.00,140000.00,'88 days 3 hours','8 days 4 hours'),
  ('65000000-0000-4000-8000-000000001010','AST-000010','equipment','Vertical Whitener WH-1',
   'Abrasive vertical whitener, 5 t/hr, 75 hp. Stone and screen changes need full lockout; bran is aspirated to baghouse BH-1.',
   'active','good','important','Riverbend Milling Machinery','RMM-VW75','RMM-VW-2290','CB-WH-1',null,'2019-05-06','2019-07-01',null,156000.00,210000.00,'88 days 3 hours','6 days 1 hours'),
  ('65000000-0000-4000-8000-000000001011','AST-000011','equipment','Mist Polisher PL-1',
   'Water-mist rice polisher, 4.5 t/hr, 60 hp, with dosing pump and bran aspiration to BH-1.',
   'active','good','important','Riverbend Milling Machinery','RMM-MP60','RMM-MP-1187','CB-PL-1',null,'2019-05-06','2019-07-01',null,132000.00,185000.00,'88 days 3 hours','15 days 5 hours'),
  ('65000000-0000-4000-8000-000000001012','AST-000012','technology','Optical Sorter OS-1',
   'Full-color optical sorter, 5 chutes. Removes chalky, pecky and discolored kernels and foreign material from head rice. Ejector air at 80 psi from AC-1.',
   'active','excellent','important','Clearview Sorting Systems','CV-5C','CV5-22-0419','CB-OS-1',null,'2022-10-03','2022-11-14','2027-11-14',248000.00,265000.00,'88 days 3 hours','30 days 2 hours'),
  ('65000000-0000-4000-8000-000000001013','AST-000013','facility_system','Baghouse Dust Collector BH-1 (Mill Aspiration)',
   'Pulse-jet baghouse serving mill aspiration (huskers, whiteners, polishers). 24,000 cfm, 196 bags, 100 hp fan, rotary airlock discharge and explosion vents on the dirty-air plenum. Differential pressure is logged every shift.',
   'active','fair','critical','Gulfstate Air Systems','GAS-PJ196','GAS-PJ-6610','CB-BH-1',null,'2016-03-14','2016-06-06',null,214000.00,360000.00,'88 days 2 hours','35 days 3 hours'),
  ('65000000-0000-4000-8000-000000001014','AST-000014','equipment','Air Compressor AC-1 (75 hp Rotary Screw)',
   'Plant air for husker roll pressure, sorter ejectors, baghouse pulse cleaning and bin gates. 75 hp, 125 psi, refrigerated dryer and 1,060 gal receiver.',
   'active','good','important','Gulfstate Air Systems','GAS-RS75','GAS-RS-40917','CB-AC-1',null,'2020-09-08','2020-10-05','2025-10-05',54000.00,68000.00,'88 days 2 hours','47 days 2 hours'),
  ('65000000-0000-4000-8000-000000001015','AST-000015','equipment','Truck Scale TS-1 (70 ft Inbound)',
   '70 ft x 11 ft concrete-deck truck scale, 100 ton capacity, used for inbound paddy and outbound bulk loads. Certified every year by a registered scale service company.',
   'active','good','important','Ironline Scale Co.','IL-7011','ILS-7011-3392','CB-TS-1',null,'2013-07-01','2013-09-09',null,88000.00,125000.00,'88 days 2 hours','20 days 4 hours'),
  ('65000000-0000-4000-8000-000000001016','AST-000016','equipment','Rail Loadout Spout RL-1',
   'Telescoping loadout spout over the rail siding, 10,000 bu/hr, with dust skirt and level probe. The hoist winch cable was found frayed at the last inspection; tagged out until the cable and sheave are replaced.',
   'out_of_service','poor','important','Prairie Conveyor Co.','PC-TLS10','PCC-TLS-6021','CB-RL-1',null,'2011-05-02','2011-07-11',null,46000.00,72000.00,'88 days 1 hours','4 days 2 hours'),
  ('65000000-0000-4000-8000-000000001017','AST-000017','vehicle_equipment','Forklift FL-09 (5,000 lb Electric)',
   '48 V electric sit-down forklift used in the bagging warehouse. Battery is charged and watered only at the Warehouse B charging station.',
   'active','fair','important','Delta Lift Trucks','DLT-E50','DLT-E50-11873','CB-FL-09','60000000-0000-4000-8000-000000003019','2021-03-15','2021-04-05',null,41000.00,52000.00,'88 days 1 hours','3 days 4 hours')
) as v(id, asset_number, asset_type, name, description, status, condition, criticality, manufacturer, model,
       serial_number, barcode, custodian, purchase_date, in_service_date, warranty, purchase_cost, replacement_cost,
       created_ago, updated_ago)
on conflict (id) do update
set name = excluded.name, description = excluded.description, status = excluded.status,
    condition = excluded.condition, criticality = excluded.criticality, manufacturer = excluded.manufacturer,
    model = excluded.model, serial_number = excluded.serial_number, barcode = excluded.barcode,
    custodian_personnel_id = excluded.custodian_personnel_id, updated_at = excluded.updated_at;

-- Keep the app's asset number generator ahead of the seeded numbers.
insert into public.forge_asset_sequences (organization_id, next_value)
values ('20000000-0000-4000-8000-000000000100', 18)
on conflict (organization_id) do update
set next_value = greatest(public.forge_asset_sequences.next_value, excluded.next_value);

-- Assignments. The seeded forklift custody row moves to the dock forklift operator.
update public.forge_asset_assignments
set personnel_id = '60000000-0000-4000-8000-000000003018',
    user_id = null,
    assignment_type = 'custody',
    assigned_at = now() - interval '88 days 6 hours',
    returned_at = null,
    returned_by = null,
    notes = 'Initial asset assignment.'
where id = '20000000-0000-4000-8000-000000001011';

insert into public.forge_asset_assignments (
  id, organization_id, asset_id, personnel_id, user_id, location_id, division_id, assignment_type,
  assigned_at, returned_at, notes, assigned_by, returned_by
)
select
  v.id::uuid, '20000000-0000-4000-8000-000000000100', v.asset_id::uuid, v.personnel::uuid, null,
  '20000000-0000-4000-8000-000000000300', '20000000-0000-4000-8000-000000000200', v.assignment_type,
  now() - v.assigned_ago::interval, now() - v.returned_ago::interval, v.notes,
  '20000000-0000-4000-8000-000000000001',
  case when v.returned_ago is null then null else '20000000-0000-4000-8000-000000000001'::uuid end
from (values
  ('65000000-0000-4000-8000-000000001102','65000000-0000-4000-8000-000000001002',null,'location','88 days 5 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001103','65000000-0000-4000-8000-000000001003',null,'location','88 days 5 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001104','65000000-0000-4000-8000-000000001004',null,'location','88 days 5 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001105','65000000-0000-4000-8000-000000001005',null,'location','88 days 5 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001106','65000000-0000-4000-8000-000000001006',null,'location','88 days 4 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001107','65000000-0000-4000-8000-000000001007',null,'location','88 days 4 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001108','65000000-0000-4000-8000-000000001008',null,'location','88 days 3 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001109','65000000-0000-4000-8000-000000001009',null,'location','88 days 3 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001110','65000000-0000-4000-8000-000000001010',null,'location','88 days 3 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001111','65000000-0000-4000-8000-000000001011',null,'location','88 days 3 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001112','65000000-0000-4000-8000-000000001012',null,'location','88 days 3 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001113','65000000-0000-4000-8000-000000001013',null,'location','88 days 2 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001114','65000000-0000-4000-8000-000000001014',null,'location','88 days 2 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001115','65000000-0000-4000-8000-000000001015',null,'location','88 days 2 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001116','65000000-0000-4000-8000-000000001016',null,'location','88 days 1 hours',null,'Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001117','65000000-0000-4000-8000-000000001017','60000000-0000-4000-8000-000000003018','custody','88 days 1 hours','40 days 3 hours','Initial asset assignment.'),
  ('65000000-0000-4000-8000-000000001118','65000000-0000-4000-8000-000000001017','60000000-0000-4000-8000-000000003019','custody','40 days 3 hours',null,'Moved to the night-shift bagging crew; Rhonda keeps FL-07 on days.')
) as v(id, asset_id, personnel, assignment_type, assigned_ago, returned_ago, notes)
on conflict (id) do nothing;

-- Maintenance history and upcoming work. Only the latest completed record per service carries next_due_date
-- (older rows would otherwise keep raising "maintenance due" Watch alerts).
update public.forge_asset_maintenance
set vendor = 'In-house',
    technician = 'Travis Guidry',
    work_order_number = 'WO-26-0391',
    description = '250-hour preventive service',
    findings = 'Mast chains within stretch limit. LPG hose and regulator leak-checked. Right steer tire about 40% worn.',
    corrective_action = 'Changed engine oil and filter, lubricated mast and chains, adjusted parking brake. Returned to service.',
    created_at = (current_date - 30) + time '15:10',
    updated_at = (current_date - 30) + time '15:10'
where id = '20000000-0000-4000-8000-000000001021';

insert into public.forge_asset_maintenance (
  id, organization_id, asset_id, maintenance_type, status, performed_on, scheduled_for, vendor, technician,
  work_order_number, description, findings, corrective_action, labor_cost, parts_cost, total_cost,
  next_due_date, next_due_meter, created_by, updated_by, created_at, updated_at
)
select
  v.id::uuid, '20000000-0000-4000-8000-000000000100', v.asset_id::uuid, v.mtype, v.status,
  case when v.performed_ago is null then null else current_date - v.performed_ago end,
  case when v.scheduled_off is null then null else current_date + v.scheduled_off end,
  v.vendor, v.technician, v.wo, v.description, v.findings, v.corrective, v.labor, v.parts,
  case when v.labor is null and v.parts is null then null else coalesce(v.labor, 0) + coalesce(v.parts, 0) end,
  case when v.next_due_off is null then null else current_date + v.next_due_off end,
  v.next_due_meter,
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  coalesce((current_date - v.performed_ago) + time '15:20', now() - v.created_ago::interval),
  coalesce((current_date - v.performed_ago) + time '15:20', now() - v.created_ago::interval)
from (values
  ('65000000-0000-4000-8000-000000001201','20000000-0000-4000-8000-000000001001','corrective','completed',9,null,'In-house','Travis Guidry','WO-26-0466','Replace cracked LPG cylinder bracket','Bracket cracked at the lower weld; found on the pre-shift checklist.','Installed new bracket and strap, leak-checked the cylinder connection.',95.00,64.80,null,null,null),
  ('65000000-0000-4000-8000-000000001202','65000000-0000-4000-8000-000000001002','inspection','completed',52,null,'In-house','Hector Ramos','WO-26-0318','Pre-harvest leg inspection: buckets, belt splice, head pulley lagging and backstop','Six cracked buckets. Head pulley lagging worn to about 60%. Belt splice sound.','Replaced six buckets; lagging replacement planned after harvest.',740.00,312.00,null,null,null),
  ('65000000-0000-4000-8000-000000001203','65000000-0000-4000-8000-000000001002','preventive','completed',18,null,'In-house','Hector Ramos','WO-26-0421','Monthly bearing lube and belt tracking check','Head bearing 112°F, boot bearing 96°F. Belt tracking centered.','Greased head and boot bearings.',185.00,22.00,12,null,null),
  ('65000000-0000-4000-8000-000000001204','65000000-0000-4000-8000-000000001002','corrective','scheduled',null,5,'In-house','Hector Ramos','WO-26-0472','Replace head pulley lagging',null,null,null,1480.00,null,null,'6 days 4 hours'),
  ('65000000-0000-4000-8000-000000001205','65000000-0000-4000-8000-000000001003','preventive','completed',33,null,'In-house','Wanda Richard','WO-26-0377','Monthly lube, bucket and belt inspection','No defects. Speed switch tested and tripped correctly.','Greased bearings; tightened two loose bucket bolts.',150.00,0.00,-3,null,null),
  ('65000000-0000-4000-8000-000000001206','65000000-0000-4000-8000-000000001004','corrective','completed',27,null,'In-house','Travis Guidry','WO-26-0395','Replace worn chain flights and return-side UHMW liners','Flights worn through on 22 links after harvest receiving.','Replaced 22 flights and 30 ft of UHMW liner.',1320.00,2860.00,null,null,null),
  ('65000000-0000-4000-8000-000000001207','65000000-0000-4000-8000-000000001004','preventive','completed',6,null,'In-house','Travis Guidry','WO-26-0480','Chain tension and sprocket inspection','Tension within spec. Drive sprocket teeth hooking slightly.','Adjusted take-up 1/2 in.; added sprocket to the spring parts order.',120.00,0.00,24,null,null),
  ('65000000-0000-4000-8000-000000001208','65000000-0000-4000-8000-000000001005','inspection','completed',44,null,'In-house','Wanda Richard','WO-26-0352','Hanger bearing and flighting inspection','Hanger bearing #3 dry and running hot; flighting worn at the inlet.','Greased all hangers; ordered hanger bearings and a 10 ft flight section.',90.00,0.00,null,null,null),
  ('65000000-0000-4000-8000-000000001209','65000000-0000-4000-8000-000000001005','corrective','scheduled',null,9,'In-house','Wanda Richard','WO-26-0474','Replace hanger bearing #3 and inlet flight section',null,null,null,910.00,null,null,'5 days 2 hours'),
  ('65000000-0000-4000-8000-000000001210','65000000-0000-4000-8000-000000001006','inspection','completed',71,null,'Delta Dryer Works Field Service','R. Castille','WO-26-0290','Pre-harvest burner and safety-control check','High-limit trips at 220°F. Flame safeguard OK. Gas train leak test passed.','None required.',860.00,0.00,null,null,null),
  ('65000000-0000-4000-8000-000000001211','65000000-0000-4000-8000-000000001006','preventive','completed',12,null,'In-house','Earl Broussard','WO-26-0447','Column screen cleaning and fan bearing lube','Light fines buildup on the column screens.','Cleaned screens, greased both fan bearings.',240.00,18.00,18,null,null),
  ('65000000-0000-4000-8000-000000001212','65000000-0000-4000-8000-000000001007','inspection','completed',64,null,'Delta Dryer Works Field Service','R. Castille','WO-26-0301','Pre-harvest burner and safety-control check','Burner ribbon showing cracks; OK to run the season with daily checks.','Rebuild scheduled after harvest.',860.00,0.00,null,null,null),
  ('65000000-0000-4000-8000-000000001213','65000000-0000-4000-8000-000000001007','corrective','in_progress',null,-4,'Delta Dryer Works Field Service','R. Castille','WO-26-0469','Post-harvest burner and plenum rebuild','Burner ribbon cracked; plenum screen holed at column 3.',null,null,6400.00,null,null,'12 days 3 hours'),
  ('65000000-0000-4000-8000-000000001214','65000000-0000-4000-8000-000000001008','preventive','completed',41,null,'In-house','Hector Ramos','WO-26-0360','Husker roll change','Rolls worn to 4 mm.','Replaced both rolls and set roll gap.',260.00,1840.00,null,null,null),
  ('65000000-0000-4000-8000-000000001215','65000000-0000-4000-8000-000000001008','preventive','in_progress',null,0,'In-house','Hector Ramos','WO-26-0485','Husker roll change and roll-gap cylinder inspection',null,null,null,1840.00,null,null,'2 days 5 hours'),
  ('65000000-0000-4000-8000-000000001216','65000000-0000-4000-8000-000000001009','inspection','completed',8,null,'In-house','Hector Ramos','WO-26-0458','Vibration and roll condition check','Rolls glazed. Drive-side bearing at 0.42 in/s and rising.','Reduced feed rate; scheduled bearing replacement and roll change.',110.00,0.00,null,null,null),
  ('65000000-0000-4000-8000-000000001217','65000000-0000-4000-8000-000000001009','corrective','scheduled',null,3,'In-house','Hector Ramos','WO-26-0459','Replace drive-side bearings and rolls',null,null,null,2620.00,null,null,'8 days 2 hours'),
  ('65000000-0000-4000-8000-000000001218','65000000-0000-4000-8000-000000001010','preventive','completed',22,null,'In-house','Wanda Richard','WO-26-0410','Stone and screen change','Stones worn evenly; two screens torn.','Replaced stones and screens; checked bran aspiration.',380.00,2150.00,38,null,null),
  ('65000000-0000-4000-8000-000000001219','65000000-0000-4000-8000-000000001011','preventive','completed',15,null,'In-house','Wanda Richard','WO-26-0436','Mist nozzle and dosing pump service','Two nozzles partly plugged.','Cleaned nozzles, replaced pump diaphragm.',140.00,96.00,15,null,null),
  ('65000000-0000-4000-8000-000000001220','65000000-0000-4000-8000-000000001012','calibration','completed',30,null,'Clearview Sorting Systems','Field technician','WO-26-0388','Quarterly color calibration and ejector check','Chute 4 ejector response slow.','Recalibrated all chutes; replaced chute 4 ejector valve.',650.00,410.00,60,null,null),
  ('65000000-0000-4000-8000-000000001221','65000000-0000-4000-8000-000000001013','inspection','completed',35,null,'In-house','Travis Guidry','WO-26-0372','Monthly baghouse inspection: bags, pulse valves, airlock and explosion vents','dP 4.8 in. w.c. Six bags in row C had holes. Vent panels intact.','Replaced six bags; cleaned the airlock.',420.00,330.00,-5,null,null),
  ('65000000-0000-4000-8000-000000001222','65000000-0000-4000-8000-000000001014','preventive','completed',47,null,'Gulfstate Air Systems','Service technician','WO-26-0341','4,000-hour compressor service','Separator dP at limit.','Changed oil, oil filter, air filter and separator element.',520.00,780.00,43,22000.00,null),
  ('65000000-0000-4000-8000-000000001223','65000000-0000-4000-8000-000000001015','certification','completed',358,null,'Ironline Scale Co.','Registered service agent','CERT-TS1-2025','Annual scale certification (record entered at Forge setup)','Within tolerance at all test weights.','Certificate posted in the scale house.',0.00,0.00,7,null,null),
  ('65000000-0000-4000-8000-000000001224','65000000-0000-4000-8000-000000001015','inspection','completed',20,null,'In-house','Cody Fontenot','WO-26-0416','Scale pit cleanout and load-cell junction box check','Water and fines in the pit; junction box dry.','Cleaned pit and drain.',300.00,0.00,null,null,null),
  ('65000000-0000-4000-8000-000000001225','65000000-0000-4000-8000-000000001016','inspection','completed',4,null,'In-house','Travis Guidry','WO-26-0478','Loadout spout winch and cable inspection','Winch cable frayed (7 broken wires in one lay).','RL-1 tagged out of service; cable and sheave ordered.',75.00,0.00,null,null,null),
  ('65000000-0000-4000-8000-000000001226','65000000-0000-4000-8000-000000001016','corrective','scheduled',null,6,'In-house','Travis Guidry','WO-26-0479','Replace hoist cable and sheave',null,null,null,690.00,null,null,'4 days 1 hours'),
  ('65000000-0000-4000-8000-000000001227','65000000-0000-4000-8000-000000001017','preventive','completed',25,null,'In-house','Travis Guidry','WO-26-0401','250-hour service and battery watering','Battery cells 3 and 11 low.','Watered battery, lubricated mast, checked brakes.',150.00,40.00,65,null,null),
  ('65000000-0000-4000-8000-000000001228','65000000-0000-4000-8000-000000001017','corrective','completed',3,null,'In-house','Travis Guidry','WO-26-0483','Replace operator-presence seat switch','Seat switch failed the pre-shift check.','Replaced seat switch and tested.',60.00,48.50,null,null,null)
) as v(id, asset_id, mtype, status, performed_ago, scheduled_off, vendor, technician, wo, description, findings,
       corrective, labor, parts, next_due_off, next_due_meter, created_ago)
on conflict (id) do nothing;

-- Meter readings.
update public.forge_asset_meter_readings
set notes = case id
      when '20000000-0000-4000-8000-000000001031' then 'Recorded at the 250-hour service.'
      else 'Pre-shift checklist reading.' end
where id in ('20000000-0000-4000-8000-000000001031', '20000000-0000-4000-8000-000000001032');

insert into public.forge_asset_meter_readings (
  id, organization_id, asset_id, meter_type, reading, unit, recorded_at, notes, recorded_by, created_at
)
select
  ('65000000-0000-4000-8000-' || lpad((130000 + m.idx * 100 + g)::text, 12, '0'))::uuid,
  '20000000-0000-4000-8000-000000000100', m.asset_id::uuid, m.meter_type,
  case when m.meter_type = 'other'
    then round(m.base + ((g * 7) % 13) / 10.0, 1)
    else round(m.base + m.per_day * (84 - (m.first_ago - g * m.step)), 1) end,
  m.unit,
  (current_date - (m.first_ago - g * m.step)) + m.at_time,
  m.notes, m.recorded_by::uuid,
  (current_date - (m.first_ago - g * m.step)) + m.at_time
from (values
  (1,'20000000-0000-4000-8000-000000001001','hours','hours',1131.0,1.9,86,28,2,time '06:40','Pre-shift checklist reading.','20000000-0000-4000-8000-000000000001'),
  (2,'65000000-0000-4000-8000-000000001017','hours','hours',3420.0,5.2,82,10,8,time '18:50','Pre-shift checklist reading.','20000000-0000-4000-8000-000000000001'),
  (3,'65000000-0000-4000-8000-000000001006','hours','hours',21480.0,18.5,80,7,11,time '05:30','Dryer log reading.','20000000-0000-4000-8000-000000000001'),
  (4,'65000000-0000-4000-8000-000000001007','hours','hours',19870.0,16.0,80,7,10,time '05:35','Dryer log reading.','20000000-0000-4000-8000-000000000001'),
  (5,'65000000-0000-4000-8000-000000001008','hours','hours',14650.0,19.0,83,9,9,time '07:05','Shift log reading.','20000000-0000-4000-8000-000000000002'),
  (6,'65000000-0000-4000-8000-000000001009','hours','hours',14210.0,17.0,83,9,9,time '07:10','Shift log reading.','20000000-0000-4000-8000-000000000002'),
  (7,'65000000-0000-4000-8000-000000001014','hours','hours',19880.0,22.0,84,14,6,time '06:15','Weekly compressor round.','20000000-0000-4000-8000-000000000001'),
  (8,'65000000-0000-4000-8000-000000001015','cycles','weighments',48200.0,64.0,84,14,6,time '17:30','Weekly scale-house count.','20000000-0000-4000-8000-000000000001'),
  (9,'65000000-0000-4000-8000-000000001013','other','in. w.c. differential pressure',3.4,0,84,7,12,time '06:20','Shift dP reading at the baghouse gauge.','20000000-0000-4000-8000-000000000002')
) as m(idx, asset_id, meter_type, unit, base, per_day, first_ago, step, cnt, at_time, notes, recorded_by)
cross join lateral generate_series(0, m.cnt - 1) as g
where m.first_ago - g * m.step >= 1
  -- FL-07 already has the two seed.sql readings (30 and 2 days ago).
  and not (m.idx = 1 and (m.first_ago - g * m.step) in (30, 2))
on conflict (id) do nothing;

-- Asset activity: re-date the seeded forklift history, then mirror the app's activity rows for every record above.
update public.forge_asset_activity
set message = case activity_type
      when 'created' then 'Asset created.'
      when 'maintenance_recorded' then 'Maintenance recorded: 250-hour preventive service'
      when 'meter_reading' then 'Meter reading recorded: 1291.7'
      else message end,
    created_at = case activity_type
      when 'created' then now() - interval '88 days 6 hours'
      when 'maintenance_recorded' then (current_date - 30) + time '15:20'
      when 'meter_reading' then now() - interval '2 days'
      else created_at end,
    actor_user_id = '20000000-0000-4000-8000-000000000001'
where asset_id = '20000000-0000-4000-8000-000000001001'
  and activity_type in ('created', 'maintenance_recorded', 'meter_reading');

insert into public.forge_asset_activity (organization_id, asset_id, activity_type, message, actor_user_id, metadata, created_at)
select a.organization_id, a.id, 'created', 'Asset created.', '20000000-0000-4000-8000-000000000001', '{}'::jsonb, a.created_at
from public.forge_assets a
where a.id::text like '65000000-0000-4000-8000-%'
  and not exists (select 1 from public.forge_asset_activity x where x.asset_id = a.id and x.activity_type = 'created');

insert into public.forge_asset_activity (organization_id, asset_id, activity_type, message, actor_user_id, metadata, created_at)
select m.organization_id, m.asset_id, 'maintenance_recorded', 'Maintenance recorded: ' || m.description,
       '20000000-0000-4000-8000-000000000001',
       jsonb_build_object('maintenance_id', m.id, 'status', m.status), m.created_at
from public.forge_asset_maintenance m
where m.id::text like '65000000-0000-4000-8000-%'
  and not exists (select 1 from public.forge_asset_activity x where x.asset_id = m.asset_id and x.metadata->>'maintenance_id' = m.id::text);

insert into public.forge_asset_activity (organization_id, asset_id, activity_type, message, actor_user_id, metadata, created_at)
select r.organization_id, r.asset_id, 'meter_reading',
       'Meter reading recorded: ' || rtrim(rtrim(r.reading::text, '0'), '.'),
       r.recorded_by, jsonb_build_object('meter_reading_id', r.id, 'meter_type', r.meter_type), r.recorded_at
from public.forge_asset_meter_readings r
where r.id::text like '65000000-0000-4000-8000-%'
  and not exists (select 1 from public.forge_asset_activity x where x.asset_id = r.asset_id and x.metadata->>'meter_reading_id' = r.id::text);

insert into public.forge_asset_activity (organization_id, asset_id, activity_type, message, actor_user_id, metadata, created_at)
select '20000000-0000-4000-8000-000000000100', v.asset_id::uuid, v.activity_type, v.message,
       '20000000-0000-4000-8000-000000000001', v.metadata::jsonb, now() - v.ago::interval
from (values
  ('65000000-0000-4000-8000-000000001017','assignment_changed','Asset assignment changed.','{"seed_key":"fl09-transfer"}','40 days 3 hours'),
  ('20000000-0000-4000-8000-000000001001','updated','Asset details updated.','{"seed_key":"fl07-custody"}','62 days 2 hours'),
  ('65000000-0000-4000-8000-000000001016','updated','Asset details updated.','{"seed_key":"rl1-out-of-service"}','4 days 2 hours'),
  ('65000000-0000-4000-8000-000000001009','updated','Asset details updated.','{"seed_key":"hu2-condition"}','8 days 4 hours'),
  ('65000000-0000-4000-8000-000000001007','updated','Asset details updated.','{"seed_key":"dr2-maintenance"}','4 days 3 hours')
) as v(asset_id, activity_type, message, metadata, ago)
where not exists (
  select 1 from public.forge_asset_activity x
  where x.asset_id = v.asset_id::uuid and x.metadata->>'seed_key' = v.metadata::jsonb->>'seed_key'
);

-- -----------------------------------------------------------------------------
-- Lockout / Tagout
-- -----------------------------------------------------------------------------

update public.forge_loto_procedures
set procedure_number = 'LOTO-000001',
    title = 'Forklift FL-07 – Hazardous Energy Control',
    description = 'Equipment-specific energy control procedure for LPG forklift FL-07 during service, tire changes, mast and hydraulic work.',
    purpose = 'Control electrical, LPG fuel, hydraulic and gravity energy before anyone services FL-07.',
    scope_text = 'All service and maintenance on FL-07 where unexpected start-up, mast or carriage movement, or fuel release could injure a worker. Does not cover routine LPG cylinder changes done under the cylinder-change SOP.',
    required_ppe = 'Safety glasses, cut-resistant gloves, safety-toe boots. Add face shield and cold-resistant gloves when disconnecting LPG fittings.',
    special_precautions = 'Service only in the maintenance bay with the forks on the floor. Never stand under a raised mast or carriage unless it is blocked with the mast safety blocks.',
    authorized_employee_notes = 'Authorized employees: maintenance technicians with current LOTO Authorized Employee training.',
    affected_employee_notes = 'Tell the dock lead and the other forklift operators that FL-07 is out of service. Hang the "Out of Service" tag on the steering wheel.',
    shutdown_notes = 'Park in the service bay, lower forks to the floor, neutral, set parking brake, turn key off.',
    restoration_notes = 'Reinstall covers, remove blocks, account for tools, remove locks, open the LPG valve, leak-check, test-drive in the bay.',
    effective_date = current_date - 60,
    next_review_date = current_date + 335,
    approved_at = now() - interval '60 days 3 hours',
    approved_by = '20000000-0000-4000-8000-000000000001',
    created_at = now() - interval '85 days 4 hours',
    updated_at = now() - interval '30 days 2 hours'
where id = '20000000-0000-4000-8000-000000001201';

update public.forge_loto_energy_sources s
set source_name = v.source_name, magnitude = v.magnitude, isolation_location = v.isolation_location,
    isolation_device = v.isolation_device, lockout_device = v.lockout_device,
    stored_energy_method = v.stored_energy_method, verification_method = v.verification_method,
    notes = v.notes, created_at = now() - interval '85 days 4 hours', updated_at = now() - interval '61 days'
from (values
  ('20000000-0000-4000-8000-000000001211','12 V starting battery and ignition circuit','12 V DC','Battery disconnect switch, left rear under the counterweight cover','Battery disconnect switch','Lockable battery disconnect cover','None after the disconnect is opened.','Turn the key to START; confirm no crank, no dash lights.',null),
  ('20000000-0000-4000-8000-000000001212','Hydraulic lift and tilt circuit','Up to 2,900 psi','Hydraulic control valve bank','Controls in neutral after lowering','Mast safety blocks (red) if the mast must stay raised','Lower forks fully, then cycle lift and tilt levers 3 times with the key off to relieve pressure.','Levers produce no movement; forks stay on the floor.',null),
  ('20000000-0000-4000-8000-000000001213','Mast, carriage and forks (gravity)','Carriage about 450 lb','Mast channels','Mast safety blocks','Mast safety blocks with lock tag','Lower to the floor. If the carriage must be raised for the work, install both mast blocks before reaching in.','Push down on the carriage; confirm it rests on the blocks.',null)
) as v(id, source_name, magnitude, isolation_location, isolation_device, lockout_device, stored_energy_method, verification_method, notes)
where s.id = v.id::uuid;

update public.forge_loto_steps s
set instructions = v.instructions, warning_text = v.warning_text,
    created_at = now() - interval '85 days 4 hours', updated_at = now() - interval '61 days'
from (values
  ('20000000-0000-4000-8000-000000001221','Tell the dock lead and the other forklift operators that FL-07 is coming out of service. Hang the Out of Service tag on the steering wheel.',null),
  ('20000000-0000-4000-8000-000000001222','Drive to the maintenance bay, lower the forks to the floor, put the direction lever in neutral, set the parking brake and turn the key off.','Do not service FL-07 on the dock or in an aisle.'),
  ('20000000-0000-4000-8000-000000001223','Close the LPG cylinder service valve and run the engine until it stalls. Turn the key off and keep it. Open the battery disconnect.',null),
  ('20000000-0000-4000-8000-000000001224','Put your personal lock and tag on the battery disconnect cover. Tag the LPG cylinder valve. Keep the key in your pocket.','Only the person who applied a lock may remove it.'),
  ('20000000-0000-4000-8000-000000001225','Cycle the lift and tilt levers 3 times to relieve hydraulic pressure. Install the mast safety blocks if the carriage must be raised.',null),
  ('20000000-0000-4000-8000-000000001226','Try to start FL-07 and operate the lift lever. Nothing should happen.','Return the key switch to OFF after the try-start.'),
  ('20000000-0000-4000-8000-000000001227','Do only the work on the work order while your lock is on.',null),
  ('20000000-0000-4000-8000-000000001228','Reinstall covers, remove mast blocks, account for tools and people, remove locks and tags, close the battery disconnect, open the LPG valve and leak-check the fittings.','Leak-check with soap solution before starting the engine.'),
  ('20000000-0000-4000-8000-000000001229','Test-drive in the bay, then tell the dock lead FL-07 is back in service.',null)
) as v(id, instructions, warning_text)
where s.id = v.id::uuid;

update public.forge_loto_reviews
set reviewed_at = now() - interval '30 days 4 hours',
    employee_observed = 'Travis Guidry',
    deviations_found = null,
    corrective_actions = null,
    notes = 'Annual periodic inspection done during the 250-hour service. Authorized employee followed every step as written and could explain each energy source.',
    next_review_date = current_date + 335,
    created_at = now() - interval '30 days 4 hours'
where id = '20000000-0000-4000-8000-000000001231';

insert into public.forge_loto_procedures (
  id, organization_id, procedure_number, asset_id, title, description, purpose, scope_text, status, revision_number,
  effective_date, next_review_date, required_ppe, special_precautions, authorized_employee_notes, affected_employee_notes,
  shutdown_notes, restoration_notes, approved_at, approved_by, created_by, updated_by, created_at, updated_at
)
select
  v.id::uuid, '20000000-0000-4000-8000-000000000100', v.num, v.asset_id::uuid, v.title, v.description, v.purpose, v.scope_text,
  v.status, v.rev,
  case when v.approved_ago is null then null else (now() - v.approved_ago::interval)::date end,
  case when v.next_review_off is null then null else current_date + v.next_review_off end,
  v.ppe, v.precautions, v.auth_notes, v.affected_notes, v.shutdown_notes, v.restore_notes,
  now() - v.approved_ago::interval,
  case when v.approved_ago is null then null else '20000000-0000-4000-8000-000000000001'::uuid end,
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  now() - v.created_ago::interval, now() - v.updated_ago::interval
from (values
  ('65000000-0000-4000-8000-000000002002','LOTO-000002','65000000-0000-4000-8000-000000001002','Bucket Elevator BE-1 (Receiving Leg) – Hazardous Energy Control',
   'Energy control for the receiving leg, its feed drag conveyor DC-1, the loaded belt and the boot take-up.',
   'Prevent start-up, belt backspin and grain flow while people work in or on BE-1.',
   'Bucket, belt, splice, head pulley, boot and bearing work on BE-1, and any entry into the boot pit. DC-1 is locked out with BE-1 because it feeds the boot.',
   'approved',2,'22 days 3 hours',335,
   'Hard hat, safety glasses, gloves, safety-toe boots, hearing protection. Full-body harness at the head platform outside the handrail.',
   'Run the leg empty before shutdown. Never open a leg door on a loaded leg. Head platform work above 6 ft outside the rail needs fall protection.',
   'Maintenance technicians and the lead electrician with current LOTO training. Group lockout box used when more than one crew works the leg.',
   'Receiving crew, control room operator and truck drivers at the dump pit.',
   'Close the pit gate, run DC-1 and BE-1 empty, stop from the HMI.',
   'Close doors, remove belt clamp, account for everyone, remove locks, close disconnects, run empty and check tracking.',
   '85 days 5 hours','18 days 2 hours'),
  ('65000000-0000-4000-8000-000000002003','LOTO-000003','65000000-0000-4000-8000-000000001008','Rubber Roll Husker HU-1 – Hazardous Energy Control',
   'Energy control for HU-1 roll changes, roll-gap cylinder work and feed hopper cleanout.',
   'Prevent roll rotation, roll-gap cylinder movement and paddy flow while rolls or guards are open.',
   'Roll changes, roll-gap cylinder and air line work, feed hopper and aspirator cleanout on HU-1.',
   'approved',1,'84 days 2 hours',-9,
   'Safety glasses, cut-resistant gloves, safety-toe boots, hearing protection, N95 for hopper cleanout.',
   'Rolls coast for up to 2 minutes after stop. Air cylinder will move when air is restored—keep hands clear of the roll gap.',
   'Mill maintenance technicians with current LOTO training. Mill operators may not apply locks for roll changes.',
   'Mill operators on the husker floor and the shift supervisor.',
   'Close feed gate SG-11, run the husker until the hopper is empty, stop at the local panel.',
   'Reinstall guards, open air valve slowly, remove locks, start empty, then open SG-11.',
   '85 days 5 hours','2 hours'),
  ('65000000-0000-4000-8000-000000002004','LOTO-000004','65000000-0000-4000-8000-000000001006','Column Dryer DR-1 – Hazardous Energy Control',
   'Energy control for DR-1 fans, metering rolls, LP gas burner, hot plenum and stored grain in the columns.',
   'Prevent start-up, gas release, burns and grain flow while people work on or inside DR-1.',
   'Fan, burner, metering roll and column screen work on DR-1. Column entry also requires a confined space permit.',
   'approved',1,'80 days 4 hours',12,
   'Hard hat, safety glasses, gloves, safety-toe boots, hearing protection. FR clothing for gas train work.',
   'Plenum stays hot long after shutdown. LP gas is heavier than air and collects in low spots.',
   'Dryer operators may lock out for screen cleaning only. Gas train work is done by the burner service vendor with our maintenance lead.',
   'Dryer operators on all shifts, receiving crew, control room.',
   'Stop the burner, run fans 30 minutes to cool, unload columns, stop fans and metering rolls.',
   'Close doors, remove locks, open gas valve, light burner per manufacturer sequence, verify flame and high-limit.',
   '85 days 3 hours','12 days 6 hours'),
  ('65000000-0000-4000-8000-000000002005','LOTO-000005','65000000-0000-4000-8000-000000001013','Baghouse BH-1 – Hazardous Energy Control',
   'Energy control for BH-1 fan, rotary airlock, pulse-jet header and fan coast-down during bag changes and airlock work.',
   'Prevent fan start-up, airlock rotation and pulse discharge while people are on the tube sheet or at the airlock.',
   'Bag and cage changes, pulse valve repair, airlock and discharge screw work on BH-1.',
   'review',1,null,null,
   'Safety glasses, gloves, N95 or better, hearing protection, harness on the roof platform.',
   'The dirty-air plenum is a confined space. Combustible dust: no hot work without a hot work permit and full cleanup.',
   'Maintenance technicians with current LOTO training.',
   'Mill operators (aspiration stops when BH-1 is down; the mill must be stopped too).',
   'Stop the mill aspiration, then stop the BH-1 fan from the HMI and let it coast down.',
   'Close doors, remove locks, start the airlock, then the fan, then restart aspiration.',
   '20 days 5 hours','3 days 2 hours'),
  ('65000000-0000-4000-8000-000000002006','LOTO-000006','65000000-0000-4000-8000-000000001010','Vertical Whitener WH-1 – Hazardous Energy Control',
   'Draft procedure for stone and screen changes on WH-1.',
   'Prevent rotor start-up and rice flow during stone and screen changes.',
   'Stone, screen and brake work on WH-1.',
   'draft',1,null,null,
   'Safety glasses, cut-resistant gloves, hearing protection, N95.',
   null,null,null,null,null,
   '6 days 1 hours','6 days 1 hours')
) as v(id, num, asset_id, title, description, purpose, scope_text, status, rev, approved_ago, next_review_off,
       ppe, precautions, auth_notes, affected_notes, shutdown_notes, restore_notes, created_ago, updated_ago)
on conflict (id) do nothing;

insert into public.forge_loto_sequences (organization_id, next_value)
values ('20000000-0000-4000-8000-000000000100', 7)
on conflict (organization_id) do update
set next_value = greatest(public.forge_loto_sequences.next_value, excluded.next_value);

insert into public.forge_loto_energy_sources (
  id, organization_id, procedure_id, energy_type, source_name, magnitude, isolation_location, isolation_device,
  lockout_device, stored_energy_method, verification_method, notes, sort_order, created_by, updated_by, created_at, updated_at
)
select
  v.id::uuid, '20000000-0000-4000-8000-000000000100', v.procedure_id::uuid, v.energy_type, v.source_name, v.magnitude,
  v.isolation_location, v.isolation_device, v.lockout_device, v.stored, v.verify, v.notes, v.sort_order,
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  p.created_at, p.created_at
from (values
  ('65000000-0000-4000-8000-000000002101','20000000-0000-4000-8000-000000001201','chemical','LPG fuel cylinder','33.5 lb cylinder','Cylinder service valve on the counterweight bracket','Cylinder service valve','Tag on the valve; remove the cylinder for any fuel-system work','Close the valve and run the engine until it stalls to empty the fuel line.','Engine will not restart; no LPG odor at the regulator.',null,40),
  -- BE-1
  ('65000000-0000-4000-8000-000000002111','65000000-0000-4000-8000-000000002002','electrical','BE-1 head drive motor','40 hp, 480 V','MCC-2, bucket 4B (Receiving Leg BE-1)','Fused disconnect, bucket 4B','Personal lock on the disconnect handle; group lock box for multi-crew jobs',null,'Press START at the head-platform station and on the HMI; no rotation. Test for absence of voltage at the motor junction box.',null,10),
  ('65000000-0000-4000-8000-000000002112','65000000-0000-4000-8000-000000002002','electrical','Feed drag conveyor DC-1','30 hp, 480 V','MCC-2, bucket 3A (DC-1)','Fused disconnect, bucket 3A','Personal lock on the disconnect handle',null,'Attempt start from the HMI; DC-1 does not run.','DC-1 feeds the boot. Lock it out so grain cannot be delivered into the leg during work.',20),
  ('65000000-0000-4000-8000-000000002113','65000000-0000-4000-8000-000000002002','gravity','Loaded buckets and belt (backspin)','Up to about 1,500 lb of grain in the up-leg','Head pulley backstop and head section','Belt clamp at the head section','Belt clamp with lock tab','Run the leg empty before shutdown. Install the belt clamp before opening any door and confirm the backstop is holding.','Look through the inspection door: up-leg empty, belt clamp tight.',null,30),
  ('65000000-0000-4000-8000-000000002114','65000000-0000-4000-8000-000000002002','mechanical','Boot take-up belt tension','Screw take-up','Boot take-up',null,null,'Do not release take-up tension unless the belt clamp is installed.','Belt clamp confirmed before any take-up adjustment.',null,40),
  -- HU-1
  ('65000000-0000-4000-8000-000000002121','65000000-0000-4000-8000-000000002003','electrical','Husker main motor','25 hp, 480 V','MCC-4, bucket 2C (Husker HU-1)','Fused disconnect, bucket 2C','Personal lock on the disconnect handle',null,'Press START at the local panel; no rotation. Test for absence of voltage at the motor junction box.',null,10),
  ('65000000-0000-4000-8000-000000002122','65000000-0000-4000-8000-000000002003','pneumatic','Roll-gap air cylinder','90 psi','Air drop ball valve V-HU1 at column M-7','Lockable 1/4-turn ball valve with bleed port','Ball valve lockout','Close V-HU1, open the bleed port and watch the gauge fall to 0 psi. Rolls will open fully.','Gauge reads 0 psi; rolls at full open.',null,20),
  ('65000000-0000-4000-8000-000000002123','65000000-0000-4000-8000-000000002003','gravity','Paddy in the feed hopper','About 300 lb','Feed slide gate SG-11 above HU-1','Slide gate with locking pin','Lock through the slide-gate pin','Close SG-11 and run the husker until the hopper is empty before stopping.','Hopper sight glass shows empty.',null,30),
  ('65000000-0000-4000-8000-000000002124','65000000-0000-4000-8000-000000002003','mechanical','Rolls coasting after stop',null,'Roll guard',null,null,'Wait at least 2 minutes after stop. Do not open the roll guard until the rolls are stationary.','Rolls visibly stopped through the guard window.',null,40),
  -- DR-1
  ('65000000-0000-4000-8000-000000002131','65000000-0000-4000-8000-000000002004','electrical','Dryer fans and discharge metering rolls','2 x 40 hp fans, 5 hp metering drive, 480 V','MCC-1, buckets 1A, 1B and 1D','Fused disconnects','Personal locks on all three disconnects',null,'Try-start both fans and the metering rolls from the dryer panel; nothing runs.',null,10),
  ('65000000-0000-4000-8000-000000002132','65000000-0000-4000-8000-000000002004','chemical','LP gas supply to the burner','8.5 MMBtu/hr, vapor at 10 psi','Manual gas shutoff (yellow handle) at the dryer gas train; main tank valve for gas train work','Lockable quarter-turn gas valve','Gas valve lockout cover','Shut off gas, let the burner flame out and bleed the gas train through the vent cock.','Gas train gauge at 0; burner will not light on a start attempt.',null,20),
  ('65000000-0000-4000-8000-000000002133','65000000-0000-4000-8000-000000002004','thermal','Hot plenum and columns','Up to 220°F','Burner off',null,null,'Run the fans with the burner off for at least 30 minutes to cool the plenum below 110°F.','Plenum below 110°F on the HMI and by IR thermometer.',null,30),
  ('65000000-0000-4000-8000-000000002134','65000000-0000-4000-8000-000000002004','gravity','Grain stored in the columns and wet garner','About 1,000 bu','Wet garner slide gate and discharge metering rolls','Slide gate with locking pin','Lock through the slide-gate pin','Unload the columns before column-screen work. If grain remains, do not open columns below the grain line.','Columns empty when viewed from the inspection doors.',null,40),
  -- BH-1
  ('65000000-0000-4000-8000-000000002141','65000000-0000-4000-8000-000000002005','electrical','Baghouse fan','100 hp, 480 V','MCC-3, bucket 5A','Fused disconnect, bucket 5A','Personal lock on the disconnect handle',null,'Try-start from the HMI; fan does not run.',null,10),
  ('65000000-0000-4000-8000-000000002142','65000000-0000-4000-8000-000000002005','electrical','Rotary airlock and discharge screw','3 hp, 480 V','MCC-3, bucket 5C','Fused disconnect, bucket 5C','Personal lock on the disconnect handle',null,'Try-start at the local station; airlock does not turn.',null,20),
  ('65000000-0000-4000-8000-000000002143','65000000-0000-4000-8000-000000002005','pneumatic','Pulse-jet header','100 psi','Header supply valve V-BH1','Lockable ball valve','Ball valve lockout','Close V-BH1 and open the header drain; gauge to 0 psi.','Header gauge at 0 psi; no pulses when the timer is cycled.',null,30),
  ('65000000-0000-4000-8000-000000002144','65000000-0000-4000-8000-000000002005','mechanical','Fan wheel coast-down',null,'Fan housing',null,null,'The fan coasts for up to 6 minutes. Wait for the zero-speed light.','Zero-speed light on; no sound or airflow at the inlet.',null,40),
  -- WH-1 (draft)
  ('65000000-0000-4000-8000-000000002151','65000000-0000-4000-8000-000000002006','electrical','Whitener main motor','75 hp, 480 V','MCC-4, bucket 4A','Fused disconnect, bucket 4A','Personal lock on the disconnect handle',null,'Try-start at the local panel; no rotation.',null,10),
  ('65000000-0000-4000-8000-000000002152','65000000-0000-4000-8000-000000002006','gravity','Rice in the feed hopper',null,'Feed gate above WH-1','Slide gate',null,'Close the feed gate and run empty before stopping.','Hopper empty.',null,20)
) as v(id, procedure_id, energy_type, source_name, magnitude, isolation_location, isolation_device, lockout_device, stored, verify, notes, sort_order)
join public.forge_loto_procedures p on p.id = v.procedure_id::uuid
on conflict (id) do nothing;

insert into public.forge_loto_steps (
  id, organization_id, procedure_id, step_type, title, instructions, warning_text, verification_required,
  verification_instructions, sort_order, created_by, updated_by, created_at, updated_at
)
select
  ('65000000-0000-4000-8000-' || lpad((220000 + v.pidx * 100 + v.sort_order)::text, 12, '0'))::uuid,
  '20000000-0000-4000-8000-000000000100', p.id, v.step_type, v.title, v.instructions, v.warning,
  v.verify_required, v.verify_text, v.sort_order,
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', p.created_at, p.created_at
from (values
  -- BE-1 (revision 2)
  (2,'65000000-0000-4000-8000-000000002002','notify','Notify the control room and receiving crew','Tell the control room operator and the receiving crew that BE-1 and DC-1 are coming down. Stop truck dumping at the pit.',null,false,null,10),
  (2,'65000000-0000-4000-8000-000000002002','shutdown','Run the leg empty and stop','Close the pit gate. Run DC-1 and BE-1 until the leg is empty (no-load amps on the HMI), then stop both from the HMI.','Never open a leg door on a loaded leg.',false,null,20),
  (2,'65000000-0000-4000-8000-000000002002','isolate','Open the disconnects at MCC-2','Open bucket 4B (BE-1 head drive) and bucket 3A (DC-1).',null,false,null,30),
  (2,'65000000-0000-4000-8000-000000002002','lock_tag','Apply locks and tags','Each authorized employee puts a personal lock and tag on buckets 4B and 3A, or on the group lock box after the lead locks the disconnects.','Contractors put their own locks on the group box.',false,null,40),
  (2,'65000000-0000-4000-8000-000000002002','release_stored','Install the belt clamp and check the backstop','Install the belt clamp at the head section. Confirm the backstop is holding and the up-leg is empty.',null,true,'Belt clamp tight; no belt movement when the head coupling is rocked by hand.',50),
  (2,'65000000-0000-4000-8000-000000002002','verify','Try-start and test for absence of voltage','Press START for BE-1 and DC-1 at the head station and on the HMI. Test for absence of voltage at the BE-1 motor junction box.','Return start controls to OFF after the try-start.',true,'No rotation of BE-1 or DC-1; meter reads 0 V phase-to-phase and phase-to-ground.',60),
  (2,'65000000-0000-4000-8000-000000002002','service','Do the work','Do only the work on the work order. Use fall protection on the head platform outside the handrail.',null,false,null,70),
  (2,'65000000-0000-4000-8000-000000002002','restore','Remove the clamp, clear the area and restore energy','Close and latch all leg doors, remove the belt clamp, account for all people and tools, remove locks, close the disconnects.','Everyone clear of the boot and head before restart.',true,'Doors latched, belt clamp removed, everyone accounted for.',80),
  (2,'65000000-0000-4000-8000-000000002002','notify_restore','Notify the control room','Tell the control room and receiving crew BE-1 is back in service. Run empty 2 minutes and check belt tracking before receiving.',null,false,null,90),
  -- HU-1
  (3,'65000000-0000-4000-8000-000000002003','notify','Notify the mill floor','Tell the shift supervisor and husker-floor operators that HU-1 is coming down. HU-2 carries the line at reduced rate.',null,false,null,10),
  (3,'65000000-0000-4000-8000-000000002003','shutdown','Empty the hopper and stop','Close feed gate SG-11, run HU-1 until the hopper is empty, then stop at the local panel.',null,false,null,20),
  (3,'65000000-0000-4000-8000-000000002003','isolate','Isolate electrical and air','Open MCC-4 bucket 2C. Close air valve V-HU1 at column M-7.',null,false,null,30),
  (3,'65000000-0000-4000-8000-000000002003','lock_tag','Apply locks and tags','Put personal locks and tags on bucket 2C, V-HU1 and the SG-11 gate pin.',null,false,null,40),
  (3,'65000000-0000-4000-8000-000000002003','release_stored','Bleed air and wait for the rolls to stop','Open the V-HU1 bleed port until the gauge reads 0 psi. Wait at least 2 minutes for the rolls to stop.','Rolls open fully when air bleeds off—keep hands clear.',true,'Gauge at 0 psi; rolls stopped and fully open.',50),
  (3,'65000000-0000-4000-8000-000000002003','verify','Try-start and test for absence of voltage','Press START at the local panel. Test for absence of voltage at the motor junction box.','Return the selector to OFF.',true,'No rotation; 0 V at the junction box.',60),
  (3,'65000000-0000-4000-8000-000000002003','service','Change rolls / do the work','Do only the work on the work order. Use the roll lifting bar; rolls weigh about 60 lb.',null,false,null,70),
  (3,'65000000-0000-4000-8000-000000002003','restore','Restore','Reinstall the roll guard, account for tools, remove locks, open V-HU1 slowly, close bucket 2C, start empty, then open SG-11.',null,true,'Guard on, air at 90 psi, husker runs empty before feed.',80),
  (3,'65000000-0000-4000-8000-000000002003','notify_restore','Notify the mill floor','Tell the shift supervisor HU-1 is back in service.',null,false,null,90),
  -- DR-1
  (4,'65000000-0000-4000-8000-000000002004','notify','Notify dryer operators and receiving','Tell the dryer operators, receiving crew and control room that DR-1 is coming down. Route wet rice to DR-2 or hold in the wet bins.',null,false,null,10),
  (4,'65000000-0000-4000-8000-000000002004','shutdown','Burner off, cool down and unload','Stop the burner. Run fans 30 minutes to cool. Unload the columns, then stop fans and metering rolls.','Do not open plenum doors until the plenum is below 110°F.',false,null,20),
  (4,'65000000-0000-4000-8000-000000002004','isolate','Isolate electrical and gas','Open MCC-1 buckets 1A, 1B and 1D. Close the manual gas shutoff at the gas train. Close the wet garner slide gate.',null,false,null,30),
  (4,'65000000-0000-4000-8000-000000002004','lock_tag','Apply locks and tags','Personal locks and tags on all three disconnects, the gas valve lockout cover and the garner gate pin.',null,false,null,40),
  (4,'65000000-0000-4000-8000-000000002004','release_stored','Bleed the gas train and confirm cool, empty columns','Bleed the gas train through the vent cock. Confirm plenum temperature and that the columns are empty.',null,true,'Gas gauge 0; plenum under 110°F; columns empty.',50),
  (4,'65000000-0000-4000-8000-000000002004','verify','Try-start','Try-start both fans, the metering rolls and the burner from the dryer panel.','Return switches to OFF.',true,'Nothing starts; burner does not light.',60),
  (4,'65000000-0000-4000-8000-000000002004','service','Do the work','Do only the work on the work order. Column entry needs a confined space permit.',null,false,null,70),
  (4,'65000000-0000-4000-8000-000000002004','restore','Restore','Close doors, account for people and tools, remove locks, open the gas valve, start fans, light the burner per the manufacturer sequence.',null,true,'Flame proven; high-limit reads normal.',80),
  (4,'65000000-0000-4000-8000-000000002004','notify_restore','Notify dryer operators','Tell the dryer operators and control room DR-1 is back in service.',null,false,null,90),
  -- BH-1 (in review)
  (5,'65000000-0000-4000-8000-000000002005','notify','Notify the mill','Tell the shift supervisor; the mill must stop because aspiration stops with BH-1.',null,false,null,10),
  (5,'65000000-0000-4000-8000-000000002005','shutdown','Stop aspiration and the fan','Stop the mill aspiration, then stop the BH-1 fan from the HMI. Let the airlock run 10 minutes to empty the hopper.',null,false,null,20),
  (5,'65000000-0000-4000-8000-000000002005','isolate','Isolate electrical and air','Open MCC-3 buckets 5A and 5C. Close header valve V-BH1.',null,false,null,30),
  (5,'65000000-0000-4000-8000-000000002005','lock_tag','Apply locks and tags','Personal locks and tags on 5A, 5C and V-BH1.',null,false,null,40),
  (5,'65000000-0000-4000-8000-000000002005','release_stored','Bleed the header and wait for zero speed','Open the header drain; gauge to 0 psi. Wait for the fan zero-speed light.',null,true,'Header 0 psi; zero-speed light on.',50),
  (5,'65000000-0000-4000-8000-000000002005','verify','Try-start','Try-start the fan and the airlock; cycle the pulse timer.','Return switches to OFF.',true,'No fan, no airlock rotation, no pulses.',60),
  (5,'65000000-0000-4000-8000-000000002005','service','Do the work','Do only the work on the work order. The dirty-air plenum is a permit-required confined space.',null,false,null,70),
  (5,'65000000-0000-4000-8000-000000002005','restore','Restore','Close doors, account for people and tools, remove locks, open V-BH1, start the airlock then the fan.',null,true,'Doors closed; dP gauge reading normal after start.',80),
  (5,'65000000-0000-4000-8000-000000002005','notify_restore','Notify the mill','Tell the shift supervisor aspiration is available and the mill can restart.',null,false,null,90),
  -- WH-1 (draft, incomplete)
  (6,'65000000-0000-4000-8000-000000002006','notify','Notify the mill floor','Tell the shift supervisor WH-1 is coming down.',null,false,null,10),
  (6,'65000000-0000-4000-8000-000000002006','shutdown','Empty and stop','Close the feed gate, run empty, stop at the local panel.',null,false,null,20),
  (6,'65000000-0000-4000-8000-000000002006','isolate','Open the disconnect','Open MCC-4 bucket 4A.',null,false,null,30),
  (6,'65000000-0000-4000-8000-000000002006','lock_tag','Apply locks and tags','Personal lock and tag on bucket 4A.',null,false,null,40)
) as v(pidx, procedure_id, step_type, title, instructions, warning, verify_required, verify_text, sort_order)
join public.forge_loto_procedures p on p.id = v.procedure_id::uuid
on conflict (id) do nothing;

insert into public.forge_loto_reviews (
  id, organization_id, procedure_id, reviewed_at, reviewed_by, review_result, employee_observed,
  deviations_found, corrective_actions, notes, next_review_date, created_at
)
values (
  '65000000-0000-4000-8000-000000002301', '20000000-0000-4000-8000-000000000100', '65000000-0000-4000-8000-000000002002',
  now() - interval '30 days 5 hours', '20000000-0000-4000-8000-000000000001', 'needs_revision', 'Hector Ramos',
  'Procedure did not require the belt clamp or a backstop check before opening the head section. The technician did it from experience, not from the procedure.',
  'Added a stored-energy step for the belt clamp and backstop, and a verify step at the head drive. Revision 2 opened.',
  'Periodic inspection during the monthly bearing lube.',
  current_date + 335,
  now() - interval '30 days 5 hours'
)
on conflict (id) do nothing;

-- Field-use records.
insert into public.forge_loto_applications (
  id, organization_id, procedure_id, asset_id, status, started_at, started_by, completed_at, completed_by,
  verification_notes, affected_employees_notified, energy_control_verified, restoration_verified, notes, created_at, updated_at
)
select
  v.id::uuid, '20000000-0000-4000-8000-000000000100', v.procedure_id::uuid, p.asset_id, v.status,
  now() - v.started_ago::interval, '20000000-0000-4000-8000-000000000001',
  now() - v.completed_ago::interval,
  case when v.completed_ago is null then null else '20000000-0000-4000-8000-000000000001'::uuid end,
  v.verification_notes, true, true, v.completed_ago is not null, v.notes,
  now() - v.started_ago::interval, coalesce(now() - v.completed_ago::interval, now() - v.started_ago::interval)
from (values
  ('65000000-0000-4000-8000-000000002401','20000000-0000-4000-8000-000000001201','completed','30 days 7 hours','30 days 4 hours','Travis Guidry, lock #11. Try-start: no crank. Lift lever: no movement.','250-hour service complete. LPG fittings leak-checked on restart.'),
  ('65000000-0000-4000-8000-000000002402','20000000-0000-4000-8000-000000001201','completed','9 days 6 hours','9 days 5 hours','Travis Guidry, lock #11.','Cylinder bracket replaced.'),
  ('65000000-0000-4000-8000-000000002403','65000000-0000-4000-8000-000000002002','completed','52 days 8 hours','52 days 2 hours','Group lockout: Hector Ramos (#14), Wanda Richard (#16), Cody Fontenot (#03) on group box GB-2.','Pre-harvest inspection; six buckets replaced.'),
  ('65000000-0000-4000-8000-000000002404','65000000-0000-4000-8000-000000002002','completed','18 days 5 hours','18 days 4 hours','Hector Ramos, lock #14. Belt clamp installed and backstop checked per revision 2.','Bearing lube and tracking check complete.'),
  ('65000000-0000-4000-8000-000000002405','65000000-0000-4000-8000-000000002003','completed','41 days 6 hours','41 days 3 hours','Hector Ramos, lock #14. Air gauge 0 psi.','Roll change complete; roll gap set.'),
  ('65000000-0000-4000-8000-000000002406','65000000-0000-4000-8000-000000002003','in_progress','2 hours',null,'Hector Ramos, lock #14. Air gauge 0 psi, 0 V at the junction box.',null),
  ('65000000-0000-4000-8000-000000002407','65000000-0000-4000-8000-000000002004','completed','12 days 9 hours','12 days 6 hours','Earl Broussard, lock #21. Plenum 96°F before doors opened.','Column screens cleaned, fan bearings greased.')
) as v(id, procedure_id, status, started_ago, completed_ago, verification_notes, notes)
join public.forge_loto_procedures p on p.id = v.procedure_id::uuid
on conflict (id) do nothing;

-- Approved-revision snapshots, built the way the app does (procedure + energy sources + steps).
insert into public.forge_loto_procedure_versions (id, organization_id, procedure_id, revision_number, snapshot, created_by, created_at)
select
  v.id::uuid, p.organization_id, p.id, v.revision,
  jsonb_build_object(
    'procedure', jsonb_set(to_jsonb(p), '{revision_number}', to_jsonb(v.revision)),
    'energy_sources', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.sort_order)
      from public.forge_loto_energy_sources e
      where e.procedure_id = p.id and not (v.before_fix and e.energy_type = 'gravity')
    ), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.sort_order)
      from public.forge_loto_steps s
      where s.procedure_id = p.id and not (v.before_fix and s.step_type = 'release_stored')
    ), '[]'::jsonb)
  ),
  '20000000-0000-4000-8000-000000000001', now() - v.ago::interval
from (values
  ('65000000-0000-4000-8000-000000002501','20000000-0000-4000-8000-000000001201',1,false,'60 days 3 hours'),
  ('65000000-0000-4000-8000-000000002502','65000000-0000-4000-8000-000000002002',1,true,'30 days 5 hours'),
  ('65000000-0000-4000-8000-000000002503','65000000-0000-4000-8000-000000002002',2,false,'22 days 3 hours'),
  ('65000000-0000-4000-8000-000000002504','65000000-0000-4000-8000-000000002003',1,false,'84 days 2 hours'),
  ('65000000-0000-4000-8000-000000002505','65000000-0000-4000-8000-000000002004',1,false,'80 days 4 hours')
) as v(id, procedure_id, revision, before_fix, ago)
join public.forge_loto_procedures p on p.id = v.procedure_id::uuid
on conflict (procedure_id, revision_number) do nothing;

-- -----------------------------------------------------------------------------
-- QR codes (the app only supports asset targets)
-- -----------------------------------------------------------------------------

update public.forge_qr_codes
set qr_number = 'QR-000001',
    name = 'FL-07 Forklift – Equipment Record',
    description = 'Tag on the overhead guard. Opens the FL-07 record for pre-shift checks and service history.',
    created_at = now() - interval '86 days 3 hours',
    updated_at = now() - interval '86 days 3 hours'
where id = '20000000-0000-4000-8000-000000001101';

update public.forge_qr_scans
set user_agent = case when auth_user_id is null
      then 'Mozilla/5.0 (Linux; Android 14; SM-A156U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
      else 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' end
where qr_code_id = '20000000-0000-4000-8000-000000001101';

insert into public.forge_qr_codes (
  id, organization_id, qr_number, name, description, status, target_type, target_id, default_action,
  created_by, updated_by, created_at, updated_at
)
select
  v.id::uuid, '20000000-0000-4000-8000-000000000100', v.qr_number, v.name, v.description, v.status, 'asset',
  v.target_id::uuid, v.action, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  now() - v.created_ago::interval, now() - v.updated_ago::interval
from (values
  ('65000000-0000-4000-8000-000000003002','QR-000002','BE-1 Receiving Leg – Head Platform','Tag at the BE-1 head platform. Opens the leg record, LOTO procedure and bearing history.','active','65000000-0000-4000-8000-000000001002','asset_record','86 days 2 hours','86 days 2 hours'),
  ('65000000-0000-4000-8000-000000003003','QR-000003','HU-1 Husker – Report Maintenance','Tag on the HU-1 guard. Opens a new maintenance record for roll wear or noise.','active','65000000-0000-4000-8000-000000001008','maintenance','86 days 2 hours','86 days 2 hours'),
  ('65000000-0000-4000-8000-000000003004','QR-000004','AC-1 Compressor – Hour Meter','Tag beside the AC-1 controller. Opens the meter reading form for the weekly round.','active','65000000-0000-4000-8000-000000001014','meter_reading','85 days 5 hours','85 days 5 hours'),
  ('65000000-0000-4000-8000-000000003005','QR-000005','FL-09 Forklift – Hour Meter','Tag on the FL-09 dash. Operators log hours with the pre-shift check.','active','65000000-0000-4000-8000-000000001017','meter_reading','85 days 5 hours','85 days 5 hours'),
  ('65000000-0000-4000-8000-000000003006','QR-000006','TS-1 Truck Scale – Scale House','Tag inside the scale house door. Opens the scale record and certification history.','active','65000000-0000-4000-8000-000000001015','asset_record','85 days 4 hours','85 days 4 hours'),
  ('65000000-0000-4000-8000-000000003007','QR-000007','DR-2 Dryer – Control Panel','Disabled while the DR-2 control panel is being rebuilt; tag removed from the panel.','disabled','65000000-0000-4000-8000-000000001007','asset_record','85 days 4 hours','4 days 3 hours')
) as v(id, qr_number, name, description, status, target_id, action, created_ago, updated_ago)
on conflict (id) do nothing;

insert into public.forge_qr_sequences (organization_id, next_value)
values ('20000000-0000-4000-8000-000000000100', 8)
on conflict (organization_id) do update
set next_value = greatest(public.forge_qr_sequences.next_value, excluded.next_value);

insert into public.forge_qr_scans (organization_id, qr_code_id, auth_user_id, destination_path, user_agent, referrer, scanned_at)
select
  q.organization_id, q.id,
  case g % 3 when 0 then null when 1 then '20000000-0000-4000-8000-000000000002'::uuid else '20000000-0000-4000-8000-000000000001'::uuid end,
  case q.default_action
    when 'maintenance' then '/assets/' || q.target_id::text || '/maintenance/create'
    when 'meter_reading' then '/assets/' || q.target_id::text || '/meter-readings/create'
    else '/assets/' || q.target_id::text end,
  case g % 2
    when 0 then 'Mozilla/5.0 (Linux; Android 14; SM-A156U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
    else 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' end,
  null,
  now() - make_interval(days => s.first_ago - g * s.step, hours => (g * 5) % 9 + 1, mins => (g * 17) % 60)
from (values
  ('65000000-0000-4000-8000-000000003002', 80, 9, 9),
  ('65000000-0000-4000-8000-000000003003', 78, 6, 13),
  ('65000000-0000-4000-8000-000000003004', 84, 7, 12),
  ('65000000-0000-4000-8000-000000003005', 82, 4, 20),
  ('65000000-0000-4000-8000-000000003006', 70, 10, 7),
  ('65000000-0000-4000-8000-000000003007', 84, 9, 9)
) as s(qr_id, first_ago, step, cnt)
join public.forge_qr_codes q on q.id = s.qr_id::uuid
cross join lateral generate_series(0, s.cnt - 1) as g
where s.first_ago - g * s.step >= 1
  and not (q.status = 'disabled' and s.first_ago - g * s.step < 6)
  and not exists (select 1 from public.forge_qr_scans x where x.qr_code_id = q.id);

update public.forge_qr_codes q
set scan_count = c.n, last_scanned_at = c.last_at
from (
  select qr_code_id, count(*) as n, max(scanned_at) as last_at
  from public.forge_qr_scans
  group by qr_code_id
) c
where c.qr_code_id = q.id
  and q.organization_id = '20000000-0000-4000-8000-000000000100'
  and (q.id::text like '65000000-0000-4000-8000-%' or q.id = '20000000-0000-4000-8000-000000001101');

-- -----------------------------------------------------------------------------
-- Training: courses, assignments, completions (base tables only; LMS content is in 40_*)
-- -----------------------------------------------------------------------------

update public.forge_training_courses
set course_code = case id when '20000000-0000-4000-8000-000000000701' then 'SAFE-101' else 'HAZ-110' end,
    title = case id when '20000000-0000-4000-8000-000000000701' then 'Plant Safety Orientation' else 'Hazard Communication (GHS) Annual Refresher' end,
    description = case id
      when '20000000-0000-4000-8000-000000000701' then 'Required before working unescorted at Cypress Bend: emergency alarms and muster points, combustible dust rules, lockout basics, confined space and bin rules, forklift traffic, PPE, and how to report injuries, near misses and hazards in Forge.'
      else 'Annual HazCom refresher: GHS labels, safety data sheets, and the chemicals used at the plant (fumigants, LP gas, lubricants, lab reagents, cleaning chemicals). Includes where to find SDSs on the mill floor.' end,
    category_key = case id when '20000000-0000-4000-8000-000000000701' then 'safety' else 'compliance' end,
    delivery_method = case id when '20000000-0000-4000-8000-000000000701' then 'classroom' else 'blended' end,
    duration_minutes = case id when '20000000-0000-4000-8000-000000000701' then 240 else 45 end,
    validity_months = case id when '20000000-0000-4000-8000-000000000701' then null else 12 end,
    created_at = now() - interval '87 days 5 hours',
    updated_at = now() - interval '60 days 2 hours'
where id in ('20000000-0000-4000-8000-000000000701', '20000000-0000-4000-8000-000000000702');

insert into public.forge_training_courses (
  id, organization_id, course_code, title, description, category_key, delivery_method, duration_minutes,
  validity_months, is_active, created_by, updated_by, created_at, updated_at
)
select v.id::uuid, '20000000-0000-4000-8000-000000000100', v.code, v.title, v.description, v.category, v.delivery,
       v.minutes, v.validity, true, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
       now() - v.created_ago::interval, now() - v.created_ago::interval
from (values
  ('65000000-0000-4000-8000-000000004001','LOTO-210','Lockout/Tagout – Authorized Employee','For employees who apply locks. Hazardous energy types at the mill, reading equipment-specific procedures in Forge, group lockout, try-start and absence-of-voltage checks, shift change and lock removal. Includes a practical on BE-1 or HU-1.','safety','blended',240,12,'87 days 4 hours'),
  ('65000000-0000-4000-8000-000000004002','PIT-120','Forklift Operator Certification','Initial and 3-year operator certification. Classroom plus hands-on evaluation on LPG and electric forklifts: pre-shift checklist, stability triangle, dock plates and trailer restraints, rail car loading, pedestrian traffic, LPG cylinder change. Evaluation renewed every 3 years.','equipment','hands_on',180,36,'87 days 4 hours'),
  ('65000000-0000-4000-8000-000000004003','CSE-230','Confined Space Entrant (General)','Entrant and attendant duties for permit-required spaces other than grain bins: the dump pit and boot pits, the baghouse dirty-air plenum, dryer plenums and tanks. Permits, atmospheric testing, ventilation, retrieval equipment and calling for rescue.','safety','blended',240,12,'87 days 3 hours'),
  ('65000000-0000-4000-8000-000000004005','HCP-150','Hearing Conservation','Noise levels in the mill and dryer areas, how to fit foam plugs and muffs, annual audiograms, and what a standard threshold shift means.','compliance','online',30,12,'87 days 2 hours'),
  ('65000000-0000-4000-8000-000000004006','FA-160','First Aid / CPR / AED','Adult first aid, CPR and AED for shift responders. Bleeding control, burns, heat illness and eye injuries. Taught by a contract instructor; card valid 2 years.','safety','classroom',300,24,'87 days 2 hours'),
  ('65000000-0000-4000-8000-000000004007','FALL-170','Fall Protection – Bin Tops and Elevated Walkways','Harness inspection and fit, anchor points on bin roofs and the leg platforms, self-retracting lifelines, ladder cages, and rescue after a fall.','safety','hands_on',120,12,'87 days 1 hours')
) as v(id, code, title, description, category, delivery, minutes, validity, created_ago)
on conflict (id) do nothing;

-- Training records. ckey: course; p: personnel suffix (00 = Forge Demo User); asg/due: assignment age and due offset
-- (null = no assignment, e.g. records imported from paper at Forge setup); comp: completion age (null = still open).
insert into demo_seed_35.cb_training_rows (n, ckey, course_id, validity_months, personnel_id, asg, due, comp, result, score, hours, instructor, approval, cert, notes)
select
  v.n, v.ckey, c.id as course_id, c.validity_months,
  case when v.p = '00' then '20000000-0000-4000-8000-000000000600'::uuid
       else ('60000000-0000-4000-8000-0000000030' || v.p)::uuid end as personnel_id,
  v.asg, v.due, v.comp, v.result, v.score, v.hours, v.instructor, v.approval, v.cert, v.notes
from (values
  -- HazCom annual refresher campaign
  (1,'HAZ','05',58,-28,'45 days 2 hours','passed',92,0.75,'Marcus Bell','approved',null,null),
  (2,'HAZ','06',58,-28,'44 days 5 hours','passed',88,0.75,'Marcus Bell','approved',null,null),
  (3,'HAZ','07',58,-28,'39 days 1 hours','passed',96,0.75,'Marcus Bell','approved',null,null),
  (4,'HAZ','08',58,-28,null,null,null,null,null,null,null,null),
  (5,'HAZ','13',58,-28,'47 days 3 hours','passed',84,0.75,'Marcus Bell','approved',null,null),
  (6,'HAZ','14',58,-28,'50 days 4 hours','passed',90,0.75,'Marcus Bell','approved',null,null),
  (7,'HAZ','15',58,-28,'33 days 6 hours','passed',80,0.75,'Jessica Boudreaux','approved',null,null),
  (8,'HAZ','16',58,-28,'46 days 2 hours','passed',100,0.75,'Marcus Bell','approved',null,null),
  (9,'HAZ','17',58,-28,'46 days 2 hours','passed',94,0.75,'Marcus Bell','approved',null,null),
  (10,'HAZ','20',58,-28,'30 days 5 hours','passed',86,0.75,'Jessica Boudreaux','approved',null,null),
  (11,'HAZ','21',58,-28,null,null,null,null,null,null,null,null),
  (12,'HAZ','23',58,-28,null,null,null,null,null,null,null,null),
  -- LOTO authorized employee
  (20,'LOTO','09',null,null,'76 days 4 hours','passed',95,4.0,'Marcus Bell','approved',null,'Annual class with practical on BE-1.'),
  (21,'LOTO','10',null,null,'76 days 4 hours','passed',90,4.0,'Marcus Bell','approved',null,'Annual class with practical on BE-1.'),
  (22,'LOTO','11',null,null,'76 days 4 hours','passed',88,4.0,'Marcus Bell','approved',null,'Annual class with practical on BE-1.'),
  (23,'LOTO','03',null,null,'76 days 4 hours','passed',91,4.0,'Marcus Bell','approved',null,'Annual class with practical on BE-1.'),
  (27,'LOTO','04',null,null,'76 days 4 hours','passed',93,4.0,'Marcus Bell','approved',null,'Annual class with practical on BE-1.'),
  (24,'LOTO','12',20,10,null,null,null,null,null,null,null,null),
  (25,'LOTO','13',null,null,'395 days','passed',87,4.0,'Marcus Bell','approved',null,'Imported from paper training records at Forge setup.'),
  (26,'LOTO','13',26,-5,null,null,null,null,null,null,null,null),
  -- Forklift operator
  (30,'PIT','18',null,null,'410 days','passed',null,3.0,'Curtis Landry (certified evaluator)','approved','CB-PIT-2025-018','Imported from paper training records at Forge setup.'),
  (31,'PIT','19',null,null,'1060 days','passed',null,3.0,'Plant evaluator','approved','CB-PIT-2023-007','Imported from paper training records at Forge setup.'),
  (32,'PIT','20',null,null,'1150 days','passed',null,3.0,'Plant evaluator','approved','CB-PIT-2023-002','Imported from paper training records at Forge setup.'),
  (33,'PIT','20',50,-20,null,null,null,null,null,null,null,null),
  (34,'PIT','22',35,14,'22 days 3 hours','passed',null,3.0,'Rhonda Lejeune (certified evaluator)','approved','CB-PIT-2026-031','Evaluated on FL-07 at the dock.'),
  (35,'PIT','23',35,14,null,null,null,null,null,null,null,null),
  -- Confined space entry
  (40,'CSE','13',50,-30,'40 days 3 hours','passed',90,4.0,'Marcus Bell','approved',null,'Retrieval drill at the BE-1 boot pit.'),
  (41,'CSE','14',66,-50,'60 days 2 hours','passed',86,4.0,'Marcus Bell','approved',null,'Seasonal hire; completed before harvest pit and dryer work.'),
  (42,'CSE','15',null,null,'430 days','passed',84,4.0,'Marcus Bell','approved',null,'Imported from paper training records at Forge setup.'),
  (43,'CSE','15',64,-36,'27 days 5 hours','passed',82,4.0,'Marcus Bell','approved',null,null),
  (44,'CSE','02',null,null,'70 days 4 hours','passed',98,4.0,'Jessica Boudreaux','approved',null,null),
  (45,'CSE','10',21,5,null,null,null,null,null,null,null,null),
  -- Hearing conservation
  (60,'HCP','05',25,5,'20 days 3 hours','passed',90,0.5,'Jessica Boudreaux','approved',null,null),
  (61,'HCP','06',25,5,null,null,null,null,null,null,null,null),
  (62,'HCP','07',25,5,'2 days 3 hours','passed',88,0.5,'Jessica Boudreaux','pending',null,null),
  (63,'HCP','08',25,5,null,null,null,null,null,null,null,null),
  (64,'HCP','00',25,5,'16 days 6 hours','passed',92,0.5,'Jessica Boudreaux','approved',null,null),
  (65,'HCP','20',25,5,'1 days 5 hours','passed',84,0.5,'Jessica Boudreaux','pending',null,'Make-up session on night shift.'),
  (66,'HCP','21',70,-40,null,null,null,null,null,null,null,null),
  -- First aid / CPR / AED
  (70,'FA','03',null,null,'82 days 4 hours','passed',null,5.0,'Contract instructor (Bayou First Aid Training)','approved','FA-2026-1182',null),
  (71,'FA','04',null,null,'700 days','passed',null,5.0,'Contract instructor','approved','FA-2024-0957','Imported from paper training records at Forge setup.'),
  (72,'FA','02',null,null,'82 days 4 hours','passed',null,5.0,'Contract instructor (Bayou First Aid Training)','approved','FA-2026-1183',null),
  (73,'FA','24',null,null,'760 days','passed',null,5.0,'Contract instructor','approved','FA-2024-0811','Imported from paper training records at Forge setup.'),
  (74,'FA','24',10,35,null,null,null,null,null,null,null,null),
  (75,'FA','09',null,null,'82 days 4 hours','passed',null,5.0,'Contract instructor (Bayou First Aid Training)','approved','FA-2026-1184',null),
  -- Fall protection
  (80,'FALL','13',45,-15,'42 days 3 hours','passed',null,2.0,'Marcus Bell','approved',null,null),
  (81,'FALL','15',45,-15,'42 days 3 hours','passed',null,2.0,'Marcus Bell','approved',null,null),
  (82,'FALL','10',45,-15,'42 days 3 hours','passed',null,2.0,'Marcus Bell','approved',null,null),
  (83,'FALL','11',45,-15,'42 days 3 hours','failed',68,2.0,'Marcus Bell','approved',null,'Did not pass the harness inspection practical; reassigned.'),
  (84,'FALL','11',41,-8,'33 days 2 hours','passed',86,2.0,'Marcus Bell','approved',null,'Retest passed.'),
  -- Orientation
  (90,'ORI','14',69,-62,'68 days 1 hours','completed',null,4.0,'Marcus Bell','approved',null,'Seasonal hire orientation.')
) as v(n, ckey, p, asg, due, comp, result, score, hours, instructor, approval, cert, notes)
join (values
  ('ORI','20000000-0000-4000-8000-000000000701'::uuid),
  ('HAZ','20000000-0000-4000-8000-000000000702'::uuid),
  ('LOTO','65000000-0000-4000-8000-000000004001'::uuid),
  ('PIT','65000000-0000-4000-8000-000000004002'::uuid),
  ('CSE','65000000-0000-4000-8000-000000004003'::uuid),
  ('HCP','65000000-0000-4000-8000-000000004005'::uuid),
  ('FA','65000000-0000-4000-8000-000000004006'::uuid),
  ('FALL','65000000-0000-4000-8000-000000004007'::uuid)
) as k(ckey, course_id) on k.ckey = v.ckey
join public.forge_training_courses c on c.id = k.course_id;

insert into public.forge_training_assignments (
  id, organization_id, course_id, personnel_id, status, assigned_at, due_date, assigned_by, notes, created_at, updated_at
)
select
  ('65000000-0000-4000-8000-' || lpad((410000 + t.n)::text, 12, '0'))::uuid,
  '20000000-0000-4000-8000-000000000100', t.course_id, t.personnel_id,
  case when t.comp is null then 'assigned' else 'completed' end,
  (current_date - t.asg) + time '07:30', current_date + t.due, '20000000-0000-4000-8000-000000000001',
  case t.ckey
    when 'HAZ' then 'Annual HazCom refresher for all production staff.'
    when 'HCP' then 'Annual hearing conservation training before audiograms.'
    when 'FALL' then 'Required before bin-top and leg platform work.'
    when 'LOTO' then 'Annual authorized-employee refresher.'
    when 'PIT' then 'Forklift evaluation (new or renewal).'
    else null end,
  (current_date - t.asg) + time '07:30',
  coalesce(least(now(), now() - t.comp::interval + interval '5 minutes'), (current_date - t.asg) + time '07:30')
from demo_seed_35.cb_training_rows t
where t.asg is not null
on conflict (id) do nothing;

insert into public.forge_training_completions (
  id, organization_id, assignment_id, course_id, personnel_id, completed_at, hours, score, instructor, result,
  approval_status, approved_by, approved_at, certificate_number, expires_at, notes, source, created_by, updated_by,
  created_at, updated_at
)
select
  ('65000000-0000-4000-8000-' || lpad((420000 + t.n)::text, 12, '0'))::uuid,
  '20000000-0000-4000-8000-000000000100',
  case when t.asg is null then null else ('65000000-0000-4000-8000-' || lpad((410000 + t.n)::text, 12, '0'))::uuid end,
  t.course_id, t.personnel_id, now() - t.comp::interval, t.hours, t.score, t.instructor, t.result,
  t.approval,
  case when t.approval = 'approved' then '20000000-0000-4000-8000-000000000001'::uuid else null end,
  case when t.approval <> 'approved' then null
       when t.asg is null and t.comp::interval > interval '88 days' then now() - interval '85 days 3 hours'
       else least(now() - interval '1 hour', now() - t.comp::interval + interval '1 day') end,
  t.cert,
  case when t.validity_months is null then null
       else (((now() - t.comp::interval) at time zone 'UTC')::date + make_interval(months => t.validity_months))::date end,
  t.notes, 'manual',
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  case when t.comp::interval > interval '88 days' then now() - interval '85 days 4 hours'
       else now() - t.comp::interval + interval '2 hours' end,
  case when t.comp::interval > interval '88 days' then now() - interval '85 days 3 hours'
       else least(now() - interval '1 hour', now() - t.comp::interval + interval '1 day') end
from demo_seed_35.cb_training_rows t
where t.comp is not null
on conflict (id) do nothing;

-- The seed.sql assignment/completion for the Forge Demo User.
update public.forge_training_assignments
set assigned_at = now() - interval '4 days 2 hours',
    due_date = current_date + 30,
    notes = 'Re-orientation after the husker floor layout change.',
    created_at = now() - interval '4 days 2 hours',
    updated_at = now() - interval '4 days 2 hours'
where id = '20000000-0000-4000-8000-000000000711';

insert into public.forge_training_assignments (
  id, organization_id, course_id, personnel_id, status, assigned_at, due_date, assigned_by, notes, created_at, updated_at
)
values (
  '65000000-0000-4000-8000-000000410013', '20000000-0000-4000-8000-000000000100', '20000000-0000-4000-8000-000000000702',
  '20000000-0000-4000-8000-000000000600', 'completed', (current_date - 58) + time '07:30', current_date - 28,
  '20000000-0000-4000-8000-000000000001', 'Annual HazCom refresher for all production staff.',
  (current_date - 58) + time '07:30', now() - interval '14 days'
)
on conflict (id) do nothing;

update public.forge_training_completions
set assignment_id = '65000000-0000-4000-8000-000000410013',
    hours = 0.75,
    score = 96,
    instructor = 'Marcus Bell',
    result = 'passed',
    approval_status = 'approved',
    approved_by = '20000000-0000-4000-8000-000000000001',
    approved_at = now() - interval '13 days 20 hours',
    certificate_number = null,
    expires_at = (((now() - interval '14 days') at time zone 'UTC')::date + interval '12 months')::date,
    notes = null,
    created_at = now() - interval '14 days',
    updated_at = now() - interval '13 days 20 hours'
where id = '20000000-0000-4000-8000-000000000721';

-- -----------------------------------------------------------------------------
-- Forge AI
-- -----------------------------------------------------------------------------

-- Knowledge sources. Saved as the app saves them (status draft); an admin indexes them from /ai/knowledge,
-- which needs the embedding provider key. Chunks need real embeddings, so none are seeded.
insert into public.forge_ai_knowledge_sources (
  id, organization_id, source_type, title, description, status, sensitivity, source_reference, content_text,
  metadata, created_by, updated_by, created_at, updated_at
)
select v.id::uuid, '20000000-0000-4000-8000-000000000100', v.source_type, v.title, v.description, 'draft', v.sensitivity,
       v.reference, v.content, '{}'::jsonb, '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
       now() - v.ago::interval, now() - v.ago::interval
from (values
  ('65000000-0000-4000-8000-000000005001','policy','Hazardous Energy Control (LOTO) Program','Plant LOTO program: roles, locks and tags, group lockout, shift change, lock removal.','internal','EHS-POL-004 Rev 3',
   E'1. Purpose\nThis program protects employees from unexpected start-up or release of hazardous energy while servicing equipment at Cypress Bend Rice Mill.\n\n2. Equipment-specific procedures\nEvery machine with more than one energy source has an equipment-specific procedure in Forge (LOTO module). Authorized employees must follow the approved revision and the procedure must be available at the machine (QR tag or printed copy).\n\n3. Locks and tags\nEach authorized employee is issued personal red locks with one key. Locks are never shared. Tags show name, date and reason.\n\n4. Group lockout\nWhen more than one crew works a machine, the lead locks the isolation points and puts the keys in a group lock box. Every worker puts a personal lock on the box.\n\n5. Shift change\nThe oncoming employee applies their lock before the outgoing employee removes theirs.\n\n6. Lock removal by others\nOnly the Plant Manager may authorize removal of another person''s lock after trying to reach that person and confirming they are off site.\n\n7. Periodic inspection\nEach procedure is inspected at least once a year by an authorized employee who is not using it. Results are recorded as a LOTO review in Forge.',
   '61 days 3 hours'),
  ('65000000-0000-4000-8000-000000005002','sop','Grain Bin Entry SOP','Permit-required entry into bins, tanks and the dump pit.','internal','OPS-SOP-012 Rev 5',
   E'Never enter a bin while any auger, sweep or discharge is running. Lock out all unloading equipment and the fill conveyor first.\n\nBefore entry: complete the confined space permit in Forge, test the atmosphere (O2 19.5–23.5%, LEL below 10%, CO and phosphine at zero after fumigation), and assign a trained attendant who stays outside.\n\nEntrants wear a full-body harness attached to a lifeline controlled from above. Do not walk on crusted or bridged grain. Break bridges from above or outside with a pole.\n\nThe attendant keeps voice contact and calls 911 and the rescue team if the entrant cannot answer. The attendant never enters to rescue.',
   '58 days 2 hours'),
  ('65000000-0000-4000-8000-000000005003','sop','Combustible Dust Housekeeping SOP','Cleaning limits, methods and frequencies for grain dust.','internal','EHS-SOP-020 Rev 2',
   E'Dust accumulation limit: no more than 1/32 in. (about the thickness of a paper clip) on any surface in the mill, headhouse or tunnel.\n\nClean with approved vacuums or by sweeping. Do not use compressed air to blow dust down while equipment is running or when ignition sources are present.\n\nFrequency: mill floor and husker area every shift; headhouse and leg platforms daily; tunnels and galleries weekly; overhead beams monthly.\n\nReport hot bearings, belt rub alarms or leaking spouts right away as an observation in Forge. Hot work in dust areas requires a hot work permit and cleanup 35 ft around the work.',
   '45 days 5 hours'),
  ('65000000-0000-4000-8000-000000005004','policy','Hot Work Permit Policy','Welding, cutting and grinding outside the maintenance shop.','internal','EHS-POL-009 Rev 2',
   E'A hot work permit is required for any welding, cutting, brazing or grinding outside the maintenance shop.\n\nBefore work: shut down and lock out nearby conveyors and legs, clean dust within 35 ft, cover openings and floor cracks, wet down combustibles, and place a charged extinguisher at the work.\n\nA fire watch stays for the whole job and 60 minutes after. The area is checked again 3 hours after work ends. The permit is closed by the shift supervisor.',
   '40 days 1 hours'),
  ('65000000-0000-4000-8000-000000005005','manual','Forklift Pre-Shift Inspection Guide','How to complete the forklift pre-shift checklist for FL-07 and FL-09.','public','SHIP-WI-003 Rev 1',
   E'Complete the checklist at the start of every shift before using FL-07 or FL-09. Scan the QR tag on the truck to log hour-meter readings.\n\nCheck: forks and heel for cracks, mast chains, hydraulic leaks, tires, horn, lights, backup alarm, seat belt, operator-presence switch, brakes and parking brake. LPG trucks: cylinder secure, no odor at the regulator. Electric trucks: battery charge and cable condition.\n\nIf anything fails, tag the truck Out of Service, park it, and tell the dock lead. Do not use it until maintenance signs it off.',
   '33 days 4 hours')
) as v(id, source_type, title, description, sensitivity, reference, content, ago)
on conflict (id) do nothing;

-- Watch rules already exist (seed.sql enables every template); record who set them up.
update public.forge_ai_watch_rules
set created_by = '20000000-0000-4000-8000-000000000001',
    updated_by = '20000000-0000-4000-8000-000000000001',
    created_at = now() - interval '86 days 2 hours',
    updated_at = now() - interval '86 days 2 hours'
where organization_id = '20000000-0000-4000-8000-000000000100'
  and created_by is null;

-- Saved analytics reports.
insert into public.forge_ai_saved_reports (
  id, organization_id, owner_user_id, name, description, prompt, report_type, visibility, pinned,
  default_date_range_days, settings, created_by, updated_by, created_at, updated_at
)
select v.id::uuid, '20000000-0000-4000-8000-000000000100', '20000000-0000-4000-8000-000000000001', v.name, v.description,
       v.prompt, v.report_type, v.visibility, v.pinned, v.days, '{}'::jsonb,
       '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
       now() - v.created_ago::interval, now() - v.updated_ago::interval
from (values
  ('65000000-0000-4000-8000-000000007001','Weekly Equipment Condition Review','Monday maintenance meeting: what is down, what is due, what is costing money.',
   'Analyze Assets & Equipment for the last 30 days. Focus on out-of-service equipment, poor or unserviceable condition, maintenance due in the next 14 days, maintenance cost, and the assets driving the most maintenance expense. Keep it to one page.',
   'asset','tenant',true,30,'63 days 2 hours','6 days 3 hours'),
  ('65000000-0000-4000-8000-000000007002','Monthly Training Gap Report','Overdue and expiring training by department for the safety committee.',
   'Analyze training for the last 30 days. List overdue assignments by department, certifications expiring in the next 60 days, and the courses creating the largest gaps. Suggest follow-up priorities.',
   'training','tenant',true,30,'55 days 5 hours','27 days 1 hours'),
  ('65000000-0000-4000-8000-000000007003','Plant Manager Executive Summary','Quarterly summary for Denise Carter.',
   'Build an executive safety summary for the last 90 days. Highlight overdue work, equipment issues, LOTO reviews due, training gaps and the top three management priorities. Separate retrieved facts from your interpretation.',
   'executive_summary','private',false,90,'20 days 4 hours','20 days 4 hours')
) as v(id, name, description, prompt, report_type, visibility, pinned, days, created_ago, updated_ago)
on conflict (id) do nothing;

-- Conversations, messages, tool runs and usage, as the chat route writes them.
insert into public.forge_ai_conversations (id, organization_id, user_id, title, status, pinned, metadata, last_message_at, created_at, updated_at)
select v.id::uuid, '20000000-0000-4000-8000-000000000100', '20000000-0000-4000-8000-000000000001', v.title, 'active', v.pinned,
       '{}'::jsonb, now() - v.ago::interval + interval '40 seconds', now() - v.ago::interval, now() - v.ago::interval + interval '40 seconds'
from (values
  ('65000000-0000-4000-8000-000000006001','Who is certified to operate forklifts?',false,'66 days 3 hours'),
  ('65000000-0000-4000-8000-000000006002','What PPE is required for entering a rice bin?',false,'52 days 5 hours'),
  ('65000000-0000-4000-8000-000000006003','Which LOTO procedures are due for annual review?',true,'25 days 6 hours'),
  ('65000000-0000-4000-8000-000000006004','Summarize overdue training by department',false,'18 days 2 hours'),
  ('65000000-0000-4000-8000-000000006005','What maintenance is coming due on mill equipment in the next two weeks?',false,'9 days 4 hours'),
  ('65000000-0000-4000-8000-000000006006','Status of rail loadout spout RL-1',false,'4 days 1 hours'),
  ('65000000-0000-4000-8000-000000006007','Draft a toolbox talk on combustible dust housekeeping for the night shift',false,'2 days 7 hours'),
  ('65000000-0000-4000-8000-000000006008','Equipment summary for the Monday meeting',true,'6 hours')
) as v(id, title, pinned, ago)
on conflict (id) do nothing;

insert into public.forge_ai_messages (organization_id, conversation_id, user_id, role, content, source_refs, metadata, created_at)
select '20000000-0000-4000-8000-000000000100', c.id,
       case when v.role = 'user' then '20000000-0000-4000-8000-000000000001'::uuid else null end,
       v.role, v.content, '[]'::jsonb,
       case when v.role = 'assistant'
         then jsonb_build_object('model', 'gpt-6-sol', 'provider_response_id', 'resp_' || substr(md5(c.id::text), 1, 24),
                                 'tool_calls', v.tool_calls, 'prepared_actions', '[]'::jsonb, 'record_context', null)
         else '{}'::jsonb end,
       c.created_at + v.offset_s * interval '1 second'
from (values
  ('65000000-0000-4000-8000-000000006001','user','Who is certified to operate forklifts?',0,0),
  ('65000000-0000-4000-8000-000000006001','assistant',E'From Training records, two people hold a current Forklift Operator Certification (PIT-120):\n\n- Rhonda Lejeune – evaluated about 13 months ago, valid 3 years.\n- Curtis Landry – evaluated almost 3 years ago; renewal will be due soon.\n\nMaria Gonzalez''s evaluation has expired. Billy Hebert and Gary Simoneaux have no forklift record. If they move product on the dock, assign PIT-120 before they operate FL-07 or FL-09.',38,1),
  ('65000000-0000-4000-8000-000000006002','user','What PPE is required for entering a rice bin?',0,0),
  ('65000000-0000-4000-8000-000000006002','assistant',E'I could not find a bin entry SOP in Forge Knowledge yet, so this is general guidance, not your plant policy:\n\n- Full-body harness attached to a lifeline controlled from outside the bin\n- Hard hat, safety glasses, gloves and safety-toe boots\n- Respirator (at least an N95 for dust; supplied air if the atmosphere test fails or after fumigation)\n- Hearing protection if aeration fans are nearby\n\nEntry also needs a permit, atmospheric testing and an attendant. Once the Grain Bin Entry SOP is added and indexed, I can quote it directly.',41,0),
  ('65000000-0000-4000-8000-000000006003','user','Which LOTO procedures are due for annual review?',0,0),
  ('65000000-0000-4000-8000-000000006003','assistant',E'Approved LOTO procedures with a periodic review coming up:\n\n1. LOTO-000003 – Rubber Roll Husker HU-1: review due in about two weeks.\n2. LOTO-000004 – Column Dryer DR-1: review due in a little over a month.\n3. LOTO-000002 – Bucket Elevator BE-1: due next fall.\n\nLOTO-000001 (Forklift FL-07) was reviewed recently. I would schedule the HU-1 review during the next roll change so the inspector can watch the procedure being used.',36,1),
  ('65000000-0000-4000-8000-000000006004','user','Summarize overdue training by department',0,0),
  ('65000000-0000-4000-8000-000000006004','assistant',E'Overdue assignments right now:\n\n**Milling** – Jamal Pierce: HazCom refresher.\n**Shipping & Receiving** – Tyrone Jackson: HazCom refresher and Hearing Conservation; Gary Simoneaux: HazCom refresher; Maria Gonzalez: forklift re-evaluation.\n**Drying & Storage** – Earl Broussard: LOTO Authorized Employee refresher (his card expired last month).\n\nThe HazCom refresher is the biggest gap (3 people). Earl''s LOTO lapse matters most because he locks out the dryers.',44,2),
  ('65000000-0000-4000-8000-000000006005','user','What maintenance is coming due on mill equipment in the next two weeks?',0,0),
  ('65000000-0000-4000-8000-000000006005','assistant',E'Due in the next 14 days or already past due:\n\n- BE-4 Mill Feed Leg – monthly lube and inspection (due within the week)\n- Baghouse BH-1 – monthly inspection (due within the week)\n- BE-1 Receiving Leg – monthly bearing lube; head pulley lagging replacement is also open\n- HU-2 Husker – bearing and roll replacement scheduled; the unit is in poor condition and running at reduced feed\n\nTS-1 scale certification also comes due soon. Want me to prepare maintenance records for any of these?',39,1),
  ('65000000-0000-4000-8000-000000006006','user','Status of rail loadout spout RL-1',0,0),
  ('65000000-0000-4000-8000-000000006006','assistant',E'RL-1 (AST-000016) is **Out of Service** and in poor condition. The last inspection found the hoist winch cable frayed (7 broken wires in one lay). A corrective work order to replace the cable and sheave is scheduled for later this week.\n\nThere is no LOTO procedure for RL-1 in Forge. Cable replacement involves gravity and electrical energy (spout weight, winch motor), so a procedure should be written before the job.',33,1),
  ('65000000-0000-4000-8000-000000006007','user','Draft a toolbox talk on combustible dust housekeeping for the night shift',0,0),
  ('65000000-0000-4000-8000-000000006007','assistant',E'**Toolbox talk – Grain dust is fuel (5 minutes)**\n\n1. Dust on beams and ledges is the fuel for a secondary explosion. A small flash in one leg can shake it loose and turn the whole room into a fireball.\n2. If you can write your name in it, it is too much. Clean it this shift.\n3. Use the vacuums or brooms. No blowing down with air while the mill is running.\n4. Hot bearings and belt-rub alarms are ignition sources. Report them right away.\n5. No grinding or welding without a hot work permit.\n\nAsk the crew: where did you see dust build up tonight? Write those spots on the cleaning board.',29,0),
  ('65000000-0000-4000-8000-000000006008','user','Give me an equipment summary for the Monday meeting.',0,0),
  ('65000000-0000-4000-8000-000000006008','assistant',E'**Equipment summary**\n\n- **Down:** RL-1 rail loadout spout (frayed winch cable); DR-2 dryer in post-harvest burner and plenum rebuild.\n- **Watch:** HU-2 husker in poor condition, bearing and roll replacement scheduled. HU-1 roll change in progress today under LOTO.\n- **Overdue PM:** BE-4 monthly lube, BH-1 monthly baghouse inspection.\n- **Due soon:** TS-1 scale certification, BE-1 bearing lube.\n- **Cost:** DC-1 chain flight and liner replacement was the largest repair this month.\n\nLOTO: HU-1 annual review is past due and DR-1 is due within two weeks.',47,2)
) as v(conversation_id, role, content, offset_s, tool_calls)
join public.forge_ai_conversations c on c.id = v.conversation_id::uuid
where not exists (select 1 from public.forge_ai_messages m where m.conversation_id = c.id);

insert into public.forge_ai_tool_runs (
  organization_id, conversation_id, user_id, capability_id, capability_key, required_permission_key, status,
  input, result_summary, result_metadata, started_at, completed_at
)
select '20000000-0000-4000-8000-000000000100', c.id, '20000000-0000-4000-8000-000000000001', cap.id, cap.capability_key,
       cap.required_permission_key, 'completed', v.input::jsonb,
       'Returned ' || v.result_count || ' record/result item(s).',
       jsonb_build_object('result_count', v.result_count, 'duration_ms', v.duration_ms),
       c.created_at + v.offset_s * interval '1 second',
       c.created_at + v.offset_s * interval '1 second' + v.duration_ms * interval '1 millisecond'
from (values
  ('65000000-0000-4000-8000-000000006001','search_training','{"query":"forklift operator"}',5,6,612),
  ('65000000-0000-4000-8000-000000006003','search_loto','{"status":"approved"}',4,5,488),
  ('65000000-0000-4000-8000-000000006004','search_training','{"status":"overdue"}',7,5,731),
  ('65000000-0000-4000-8000-000000006004','search_personnel','{"query":"Earl Broussard"}',1,14,302),
  ('65000000-0000-4000-8000-000000006005','search_assets','{"maintenance_due_days":14}',6,6,655),
  ('65000000-0000-4000-8000-000000006006','record_context','{"type":"asset","reference":"AST-000016"}',1,4,244),
  ('65000000-0000-4000-8000-000000006008','analytics_assets','{"days":30}',4,5,1180),
  ('65000000-0000-4000-8000-000000006008','search_loto','{"review_due_days":30}',2,15,402)
) as v(conversation_id, capability_key, input, result_count, offset_s, duration_ms)
join public.forge_ai_conversations c on c.id = v.conversation_id::uuid
join public.forge_ai_capabilities cap on cap.capability_key = v.capability_key
where not exists (select 1 from public.forge_ai_tool_runs r where r.conversation_id = c.id);

insert into public.forge_ai_usage_events (
  organization_id, user_id, conversation_id, provider, model, provider_response_id, input_tokens, output_tokens,
  reasoning_tokens, total_tokens, tool_calls, duration_ms, metadata, created_at
)
select '20000000-0000-4000-8000-000000000100', '20000000-0000-4000-8000-000000000001', c.id, 'openai', 'gpt-6-sol',
       'resp_' || substr(md5(c.id::text), 1, 24), v.input_tokens, v.output_tokens, v.reasoning_tokens,
       v.input_tokens + v.output_tokens + v.reasoning_tokens, v.tool_calls, v.duration_ms, '{}'::jsonb,
       c.created_at + interval '40 seconds'
from (values
  ('65000000-0000-4000-8000-000000006001',6420,310,780,1,9800),
  ('65000000-0000-4000-8000-000000006002',3980,355,640,0,7400),
  ('65000000-0000-4000-8000-000000006003',7150,342,910,1,10200),
  ('65000000-0000-4000-8000-000000006004',9830,398,1460,2,13900),
  ('65000000-0000-4000-8000-000000006005',8610,371,1120,1,11800),
  ('65000000-0000-4000-8000-000000006006',5240,296,700,1,8600),
  ('65000000-0000-4000-8000-000000006007',3720,402,520,0,9100),
  ('65000000-0000-4000-8000-000000006008',11960,436,1780,2,16400)
) as v(conversation_id, input_tokens, output_tokens, reasoning_tokens, tool_calls, duration_ms)
join public.forge_ai_conversations c on c.id = v.conversation_id::uuid
where not exists (select 1 from public.forge_ai_usage_events u where u.conversation_id = c.id);

insert into public.forge_ai_feedback (organization_id, conversation_id, message_id, user_id, rating, category, comments, created_at)
select '20000000-0000-4000-8000-000000000100', m.conversation_id, m.id, '20000000-0000-4000-8000-000000000001', 1, v.category, v.comments,
       m.created_at + interval '3 minutes'
from (values
  ('65000000-0000-4000-8000-000000006004','helpful','Used this for the safety committee agenda.'),
  ('65000000-0000-4000-8000-000000006008','helpful',null)
) as v(conversation_id, category, comments)
join public.forge_ai_messages m on m.conversation_id = v.conversation_id::uuid and m.role = 'assistant'
where not exists (select 1 from public.forge_ai_feedback f where f.conversation_id = m.conversation_id);

-- Watch runs: one scheduled run per morning for the last 30 days.
insert into public.forge_ai_watch_runs (
  organization_id, trigger_type, started_by, status, evaluated_rules, alerts_created, alerts_refreshed, alerts_resolved,
  error_message, started_at, completed_at
)
select '20000000-0000-4000-8000-000000000100', 'scheduled', null, 'completed', 9,
       case when g in (30, 14, 9, 5, 4) then 2 when g % 6 = 0 then 1 else 0 end,
       6 + (30 - g) / 5,
       case when g in (11, 3) then 1 else 0 end,
       null,
       (current_date - g) + time '10:00',
       (current_date - g) + time '10:00' + interval '3 seconds'
from generate_series(1, 30) as g
where not exists (select 1 from public.forge_ai_watch_runs r where r.organization_id = '20000000-0000-4000-8000-000000000100');

-- Watch alerts for this file's modules, built with the same rules and wording as lib/forgeAiWatch.ts.
-- Other modules' alerts appear on the next Watch run.
with rule as (
  select r.id as rule_id, t.rule_key, coalesce(r.severity_override, t.severity) as severity
  from public.forge_ai_watch_rules r
  join public.forge_ai_watch_rule_templates t on t.id = r.template_id
  where r.organization_id = '20000000-0000-4000-8000-000000000100' and r.enabled
),
last_run as (select (current_date - 1) + time '10:00' as at),
candidates as (
  -- training.overdue
  select 'training.overdue' as rule_key, 'training_assignment' as target_type, a.id::text as target_id,
         c.course_code as target_reference,
         'Overdue training: ' || c.title as title,
         p.first_name || ' ' || p.last_name || ' is ' || (current_date - a.due_date) || ' day(s) past the due date (' || a.due_date || ').' as summary,
         p.location_id, p.division_id,
         jsonb_build_object('due_date', a.due_date, 'status', a.status, 'course_title', c.title, 'course_code', c.course_code,
                            'personnel_name', p.first_name || ' ' || p.last_name, 'employee_number', p.employee_number, 'path', '/training') as data,
         (a.due_date + 1)::timestamp as started
  from public.forge_training_assignments a
  join public.forge_training_courses c on c.id = a.course_id
  join public.forge_personnel p on p.id = a.personnel_id
  where a.organization_id = '20000000-0000-4000-8000-000000000100'
    and a.due_date < current_date - 1 and a.status not in ('completed', 'canceled')
  union all
  -- asset.out_of_service / asset.poor_condition
  select k.rule_key, 'asset', a.id::text, a.asset_number,
         case k.rule_key when 'asset.out_of_service' then 'Asset out of service: ' || a.name else 'Asset condition requires attention: ' || a.name end,
         case k.rule_key when 'asset.out_of_service' then a.asset_number || ' is currently marked Out of Service.'
              else a.asset_number || ' is currently in ' || replace(a.condition, '_', ' ') || ' condition.' end,
         a.location_id, a.division_id,
         jsonb_build_object('asset_number', a.asset_number, 'asset_name', a.name, 'status', a.status, 'condition', a.condition,
                            'criticality', a.criticality, 'path', '/assets/' || a.id),
         a.updated_at::timestamp
  from public.forge_assets a
  cross join (values ('asset.out_of_service'), ('asset.poor_condition')) as k(rule_key)
  where a.organization_id = '20000000-0000-4000-8000-000000000100' and a.retired_at is null
    and ((k.rule_key = 'asset.out_of_service' and a.status = 'out_of_service')
      or (k.rule_key = 'asset.poor_condition' and a.condition in ('poor', 'unserviceable')))
  union all
  -- asset.maintenance_due
  select 'asset.maintenance_due', 'asset_maintenance', m.id::text, a.asset_number,
         case when m.next_due_date < current_date then 'Asset maintenance overdue: ' else 'Asset maintenance due: ' end || a.name,
         a.asset_number || ' has ' || replace(m.maintenance_type, '_', ' ') || ' maintenance ' ||
           case when m.next_due_date < current_date then (current_date - m.next_due_date) || ' day(s) overdue.'
                else 'due by ' || m.next_due_date || '.' end,
         a.location_id, a.division_id,
         jsonb_build_object('asset_id', m.asset_id, 'asset_number', a.asset_number, 'asset_name', a.name,
                            'maintenance_type', m.maintenance_type, 'next_due_date', m.next_due_date,
                            'overdue', m.next_due_date < current_date, 'path', '/assets/' || m.asset_id),
         (m.next_due_date - 14)::timestamp
  from public.forge_asset_maintenance m
  join public.forge_assets a on a.id = m.asset_id
  where m.organization_id = '20000000-0000-4000-8000-000000000100' and a.retired_at is null
    and m.next_due_date is not null and m.next_due_date <= current_date + 14
  union all
  -- loto.review_due
  select 'loto.review_due', 'loto_procedure', l.id::text, l.procedure_number,
         case when l.next_review_date < current_date then 'LOTO review overdue: ' else 'LOTO review due: ' end || l.title,
         l.procedure_number || ' for ' || coalesce(a.asset_number, a.name, 'linked equipment') || ' has a periodic review ' ||
           case when l.next_review_date < current_date then (current_date - l.next_review_date) || ' day(s) overdue.'
                else 'due by ' || l.next_review_date || '.' end,
         a.location_id, a.division_id,
         jsonb_build_object('procedure_number', l.procedure_number, 'title', l.title, 'next_review_date', l.next_review_date,
                            'overdue', l.next_review_date < current_date, 'asset_id', l.asset_id,
                            'asset_number', a.asset_number, 'asset_name', a.name, 'path', '/loto/' || l.id),
         (l.next_review_date - 30)::timestamp
  from public.forge_loto_procedures l
  left join public.forge_assets a on a.id = l.asset_id
  where l.organization_id = '20000000-0000-4000-8000-000000000100' and l.status = 'approved'
    and l.next_review_date is not null and l.next_review_date <= current_date + 30
)
insert into public.forge_ai_watch_alerts (
  organization_id, watch_rule_id, rule_key, severity, status, target_type, target_id, target_reference, title, summary,
  location_id, division_id, data, dedupe_key, first_detected_at, last_detected_at, acknowledged_at, acknowledged_by,
  created_at, updated_at
)
select '20000000-0000-4000-8000-000000000100', r.rule_id, c.rule_key, r.severity,
       case when c.rule_key = 'asset.out_of_service' or (c.rule_key = 'training.overdue' and c.target_reference = 'HAZ-110') then 'acknowledged' else 'open' end,
       c.target_type, c.target_id, c.target_reference, c.title, c.summary, c.location_id, c.division_id, c.data,
       c.rule_key || ':' || c.target_type || ':' || c.target_id,
       greatest(least(date_trunc('day', c.started) + time '10:00', lr.at), (current_date - 30) + time '10:00'),
       lr.at,
       case when c.rule_key = 'asset.out_of_service' or (c.rule_key = 'training.overdue' and c.target_reference = 'HAZ-110')
            then lr.at + interval '1 hour 20 minutes' end,
       case when c.rule_key = 'asset.out_of_service' or (c.rule_key = 'training.overdue' and c.target_reference = 'HAZ-110')
            then '20000000-0000-4000-8000-000000000001'::uuid end,
       greatest(least(date_trunc('day', c.started) + time '10:00', lr.at), (current_date - 30) + time '10:00'),
       lr.at
from candidates c
join rule r on r.rule_key = c.rule_key
cross join last_run lr
on conflict (organization_id, dedupe_key) do nothing;

-- One alert that cleared on its own: DR-2 was marked out of service early in harvest, then repaired.
insert into public.forge_ai_watch_alerts (
  organization_id, watch_rule_id, rule_key, severity, status, target_type, target_id, target_reference, title, summary,
  location_id, division_id, data, dedupe_key, first_detected_at, last_detected_at, resolved_at, resolved_by, created_at, updated_at
)
select '20000000-0000-4000-8000-000000000100', r.id, 'asset.out_of_service', coalesce(r.severity_override, t.severity), 'resolved',
       'asset', '65000000-0000-4000-8000-000000001007', 'AST-000007', 'Asset out of service: Column Dryer DR-2 (LP Gas)',
       'AST-000007 is currently marked Out of Service.',
       '20000000-0000-4000-8000-000000000300', '20000000-0000-4000-8000-000000000200',
       jsonb_build_object('asset_number', 'AST-000007', 'asset_name', 'Column Dryer DR-2 (LP Gas)', 'status', 'out_of_service',
                          'condition', 'fair', 'criticality', 'critical', 'path', '/assets/65000000-0000-4000-8000-000000001007'),
       'asset.out_of_service:asset:65000000-0000-4000-8000-000000001007',
       (current_date - 14) + time '10:00', (current_date - 12) + time '10:00', (current_date - 11) + time '10:00', null,
       (current_date - 14) + time '10:00', (current_date - 11) + time '10:00'
from public.forge_ai_watch_rules r
join public.forge_ai_watch_rule_templates t on t.id = r.template_id
where r.organization_id = '20000000-0000-4000-8000-000000000100' and t.rule_key = 'asset.out_of_service'
on conflict (organization_id, dedupe_key) do nothing;
