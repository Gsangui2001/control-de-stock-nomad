-- Make Chef available for future access; do not create accounts or memberships.
alter table boat_control.members drop constraint if exists members_role_check;
alter table boat_control.members add constraint members_role_check
  check (role in ('capitan','chef','marinero','lector','encargado'));
