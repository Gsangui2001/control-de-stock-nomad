-- El encargado es la única cuenta no administradora que puede gestionar
-- el manual de instrucciones y las cámaras del barco.
alter table boat_control.members
  drop constraint if exists members_role_check;

alter table boat_control.members
  add constraint members_role_check
  check (role in ('capitan','marinero','lector','encargado'));
