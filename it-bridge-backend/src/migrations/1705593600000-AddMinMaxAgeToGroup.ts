import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMinMaxAgeToGroup1705593600000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add minAge and maxAge columns with default values
        await queryRunner.addColumn(
            'groups',
            new TableColumn({
                name: 'minAge',
                type: 'decimal',
                isNullable: false,
                default: 0,
            }),
        );

        await queryRunner.addColumn(
            'groups',
            new TableColumn({
                name: 'maxAge',
                type: 'decimal',
                isNullable: false,
                default: 18,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Rollback: remove columns
        await queryRunner.dropColumn('groups', 'maxAge');
        await queryRunner.dropColumn('groups', 'minAge');
    }
}
