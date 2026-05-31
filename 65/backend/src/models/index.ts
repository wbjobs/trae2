import User from './User.model';
import Specimen from './Specimen.model';
import SpecimenImage from './SpecimenImage.model';
import Traceability from './Traceability.model';

Specimen.hasMany(SpecimenImage, {
  foreignKey: 'specimenId',
  as: 'images',
  onDelete: 'CASCADE'
});

SpecimenImage.belongsTo(Specimen, {
  foreignKey: 'specimenId',
  as: 'specimen'
});

Specimen.hasMany(Traceability, {
  foreignKey: 'specimenId',
  as: 'traceabilityRecords',
  onDelete: 'CASCADE'
});

Traceability.belongsTo(Specimen, {
  foreignKey: 'specimenId',
  as: 'specimen'
});

User.hasMany(Specimen, {
  foreignKey: 'createdBy',
  as: 'createdSpecimens'
});

Specimen.belongsTo(User, {
  foreignKey: 'createdBy',
  as: 'creator'
});

User.hasMany(SpecimenImage, {
  foreignKey: 'uploadedBy',
  as: 'uploadedImages'
});

SpecimenImage.belongsTo(User, {
  foreignKey: 'uploadedBy',
  as: 'uploader'
});

User.hasMany(Traceability, {
  foreignKey: 'operatorId',
  as: 'traceRecords'
});

Traceability.belongsTo(User, {
  foreignKey: 'operatorId',
  as: 'operatorUser'
});

export { User, Specimen, SpecimenImage, Traceability };
